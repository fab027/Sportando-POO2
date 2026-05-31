#!/usr/bin/env python3
"""Small HTTP bridge between the React app and ScraperFC/SofaScore data."""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
import sys
import time
import traceback
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from typing import Any

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

try:
    import ScraperFC as sfc
    from ScraperFC.utils import botasaurus_browser_get_json, botasaurus_request_get_json
except Exception as exc:  # pragma: no cover
    sfc = None
    botasaurus_request_get_json = None
    botasaurus_browser_get_json = None
    SCRAPERFC_IMPORT_ERROR = exc
else:
    SCRAPERFC_IMPORT_ERROR = None


API_PREFIX = "https://api.sofascore.com/api/v1"
DEFAULT_PORT = 8787
CACHE_TTL_SECONDS = 120
_CACHE: dict[str, tuple[float, Any]] = {}
_SCRAPER = None
_SOFA_LOCK = Lock()


def _scraper():
    global _SCRAPER
    if _SCRAPER is None:
        if sfc is None:
            raise RuntimeError(f"ScraperFC is not installed: {SCRAPERFC_IMPORT_ERROR}")
        _SCRAPER = sfc.Sofascore()
    return _SCRAPER


def _json_default(value: Any):
    if hasattr(value, "item"):
        return value.item()
    if hasattr(value, "to_dict"):
        return value.to_dict(orient="records")
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def _send_json(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200):
    body = json.dumps(payload, default=_json_default, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _cache_key(path: str) -> str:
    return path


def sofa_json(path: str) -> Any:
    if not path.startswith("/"):
        path = f"/{path}"

    key = _cache_key(path)
    cached = _CACHE.get(key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    url = f"{API_PREFIX}{path}"
    with _SOFA_LOCK:
        cached = _CACHE.get(key)
        if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]

        errors: list[str] = []
        data = None

        if botasaurus_request_get_json is not None:
            try:
                data = botasaurus_request_get_json(url)
                if isinstance(data, dict) and data.get("error"):
                    raise RuntimeError(json.dumps(data.get("error"), ensure_ascii=False))
            except Exception as exc:
                data = None
                errors.append(f"botasaurus_request_get_json: {exc}")

        browser_fallback_enabled = os.environ.get("SCRAPERFC_DISABLE_BROWSER_FALLBACK") != "1"
        if data is None and browser_fallback_enabled and botasaurus_browser_get_json is not None:
            try:
                data = botasaurus_browser_get_json(url)
                if isinstance(data, dict) and data.get("error"):
                    raise RuntimeError(json.dumps(data.get("error"), ensure_ascii=False))
            except Exception as exc:
                data = None
                errors.append(f"botasaurus_browser_get_json: {exc}")
            finally:
                cleanup_botasaurus_chrome()

        if data is None:
            try:
                request = urllib.request.Request(
                    url,
                    headers={
                        "Accept": "application/json",
                        "Referer": "https://www.sofascore.com/",
                        "User-Agent": (
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
                        ),
                    },
                )
                with urllib.request.urlopen(request, timeout=30) as response:
                    data = json.loads(response.read().decode("utf-8"))
            except Exception as exc:
                errors.append(f"urllib: {exc}")

        if data is None:
            raise RuntimeError("; ".join(errors) or "SofaScore fetch failed")

        _CACHE[key] = (time.time(), data)
        return data


def cleanup_botasaurus_chrome():
    if os.name != "nt":
        return

    command = (
        "Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\" | "
        "Where-Object { $_.CommandLine -like '*\\\\Temp\\\\bota\\\\*' } | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
            check=False,
        )
    except Exception:
        pass


def unique_tournament_id_from_url(league_url: str) -> int:
    match = re.search(r"/(\d+)(?:[/?#].*)?$", league_url)
    if not match:
        raise ValueError("URL de liga invalida")
    return int(match.group(1))


def get_current_season_id(tournament_id: int) -> int:
    data = sofa_json(f"/unique-tournament/{tournament_id}/seasons")
    seasons = data.get("seasons") if isinstance(data, dict) else []
    if not seasons:
        raise ValueError(f"Temporada nao encontrada para torneio {tournament_id}")
    return int(seasons[0]["id"])


def team_image_url(team_id: Any) -> str | None:
    return f"https://api.sofascore.app/api/v1/team/{team_id}/image" if team_id else None


def player_image_url(player_id: Any) -> str | None:
    return f"https://api.sofascore.app/api/v1/player/{player_id}/image" if player_id else None


def normalize_status(event: dict[str, Any]) -> str:
    status_type = event.get("status", {}).get("type")
    if status_type == "finished":
        return "Finished"
    if status_type == "inprogress":
        return "Live"
    if status_type == "notstarted":
        return "Scheduled"
    return event.get("status", {}).get("description") or "Scheduled"


def map_event(event: dict[str, Any]) -> dict[str, Any]:
    home = event.get("homeTeam") or {}
    away = event.get("awayTeam") or {}
    tournament = event.get("tournament") or {}
    unique = tournament.get("uniqueTournament") or {}
    venue = event.get("venue") or {}
    stadium = venue.get("stadium") or {}
    city = venue.get("city") or {}
    home_score = event.get("homeScore") or {}
    away_score = event.get("awayScore") or {}
    round_info = event.get("roundInfo") or {}

    return {
        "id": event.get("id"),
        "homeTeamId": home.get("id"),
        "awayTeamId": away.get("id"),
        "homeTeam": home.get("name") or home.get("shortName") or "Unknown",
        "awayTeam": away.get("name") or away.get("shortName") or "Unknown",
        "homeTeamImageUrl": team_image_url(home.get("id")),
        "awayTeamImageUrl": team_image_url(away.get("id")),
        "homeScore": home_score.get("current") if isinstance(home_score.get("current"), int) else None,
        "awayScore": away_score.get("current") if isinstance(away_score.get("current"), int) else None,
        "status": normalize_status(event),
        "startTimestamp": event.get("startTimestamp") or 0,
        "tournament": unique.get("name") or tournament.get("name") or "Desconhecido",
        "tournamentId": unique.get("id"),
        "roundInfo": round_info.get("round") if isinstance(round_info.get("round"), int) else None,
        "roundName": round_info.get("name") or round_info.get("slug"),
        "venue": stadium.get("name") or venue.get("name") or city.get("name"),
    }


def event_country(event: dict[str, Any]) -> str:
    tournament = event.get("tournament") or {}
    unique = tournament.get("uniqueTournament") or {}
    category = tournament.get("category") or unique.get("category") or event.get("category") or {}
    return category.get("name") or "Outros"


def today_local_iso() -> str:
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d")
    return datetime.utcnow().strftime("%Y-%m-%d")


def local_iso_from_timestamp(timestamp: int | None) -> str | None:
    if not timestamp:
        return None
    if ZoneInfo is not None:
        return datetime.fromtimestamp(timestamp, ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d")
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d")


def format_time(timestamp: int) -> str:
    if ZoneInfo is not None:
        dt = datetime.fromtimestamp(timestamp, ZoneInfo("America/Sao_Paulo"))
    else:
        dt = datetime.fromtimestamp(timestamp)
    return dt.strftime("%H:%M")


def map_position(position: str | None) -> str:
    p = (position or "").upper()
    positions = {
        "G": "Goleiro",
        "GK": "Goleiro",
        "D": "Defensor",
        "CB": "Zagueiro",
        "DC": "Zagueiro",
        "LB": "Lateral Esquerdo",
        "RB": "Lateral Direito",
        "M": "Meio-campista",
        "DM": "Volante",
        "CM": "Meia Central",
        "AM": "Meia Ofensivo",
        "F": "Atacante",
        "ST": "Centroavante",
        "CF": "Segundo Atacante",
        "LW": "Ponta Esquerda",
        "RW": "Ponta Direita",
    }
    if p in positions:
        return positions[p]
    if p == "DEFENDER":
        return "Defensor"
    if p == "MIDFIELDER":
        return "Meio-campista"
    if p in {"ATTACKER", "FORWARD"}:
        return "Atacante"
    return position or ""


def player_url(player: dict[str, Any]) -> str:
    if player.get("slug") and player.get("id"):
        return f"https://www.sofascore.com/player/{player['slug']}/{player['id']}"
    return ""


def player_age(player: dict[str, Any]) -> int | None:
    dob = player.get("dateOfBirthTimestamp")
    if not dob:
        return None
    return int((time.time() - int(dob)) / (365.25 * 24 * 60 * 60))


def extract_player_id(url: str) -> int | None:
    match = re.search(r"/player/[^/]+/(\d+)", url, re.I) or re.search(r"/(\d+)(?:[/?#].*)?$", url)
    return int(match.group(1)) if match else None


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def is_male_football_player(player: dict[str, Any]) -> bool:
    sport = (player.get("sport") or {}).get("slug") or (player.get("team") or {}).get("sport", {}).get("slug")
    return bool(player.get("id") and sport == "football" and player.get("gender") != "F" and (player.get("team") or {}).get("gender") != "F")


def search_player_score(player: dict[str, Any], query: str) -> int:
    q = normalize_text(query)
    name = normalize_text(player.get("name") or player.get("shortName") or "")
    score = int(player.get("userCount") or 0)
    if name == q:
        score += 100000
    elif name.startswith(q):
        score += 50000
    elif q in name:
        score += 20000
    for token in q.split():
        if token in name:
            score += 5000
    if (player.get("team") or {}).get("name"):
        score += 500
    return score


def extract_players_from_search(data: dict[str, Any], query: str) -> list[dict[str, Any]]:
    rows = []
    for item in data.get("results") or []:
        player = item.get("entity") if item.get("type") == "player" else item.get("entity") or item.get("player") or item
        if isinstance(player, dict) and is_male_football_player(player) and player_url(player):
            rows.append({"player": player, "score": search_player_score(player, query)})
    return rows


def find_football_team(team_name: str) -> dict[str, Any] | None:
    data = sofa_json(f"/search/teams?q={urllib.parse.quote(team_name)}&page=0")
    for item in data.get("results") or []:
        entity = item.get("entity") or {}
        if entity.get("sport", {}).get("slug") == "football" and entity.get("gender") != "F":
            return entity
    return None


def map_season_stats(stats_data: dict[str, Any], pair: dict[str, Any], player: dict[str, Any]) -> dict[str, Any] | None:
    stats = stats_data.get("statistics")
    if not stats:
        return None
    season = pair.get("season") or {}
    tournament = pair.get("uniqueTournament") or {}
    team = stats_data.get("team") or player.get("team") or {}
    return {
        "season": season.get("year") or season.get("name") or "",
        "tournament": tournament.get("name") or "",
        "team": team.get("name") or "",
        "teamImageUrl": team_image_url(team.get("id")),
        "matchesPlayed": int(stats.get("appearances") or stats.get("matchesStarted") or stats.get("countRating") or 0),
        "starts": int(stats.get("matchesStarted") or 0),
        "minutes": int(stats.get("minutesPlayed") or 0),
        "goals": int(stats.get("goals") or 0),
        "assists": int(stats.get("assists") or 0),
        "rating": float(stats.get("rating") or 0),
        "yellowCards": int(stats.get("yellowCards") or 0),
        "redCards": int(stats.get("redCards") or 0),
        "shotsOnTarget": int(stats.get("shotsOnTarget") or 0),
        "totalShots": int(stats.get("totalShots") or 0),
        "keyPasses": int(stats.get("keyPasses") or 0),
        "passAccuracy": float(stats.get("accuratePassesPercentage") or 0),
        "expectedGoals": float(stats.get("expectedGoals") or 0),
        "expectedAssists": float(stats.get("expectedAssists") or 0),
    }


def player_season_pairs(seasons_data: dict[str, Any], limit: int = 12) -> list[dict[str, Any]]:
    pairs = []
    seen = set()
    for group in seasons_data.get("uniqueTournamentSeasons") or []:
        unique = group.get("uniqueTournament") or {}
        seasons = group.get("seasons") if isinstance(group.get("seasons"), list) else [group.get("season")]
        for season in (seasons or [])[:3]:
            if not unique.get("id") or not season or not season.get("id"):
                continue
            key = f"{unique['id']}:{season['id']}"
            if key in seen:
                continue
            seen.add(key)
            pairs.append({"uniqueTournament": unique, "season": season})
            if len(pairs) >= limit:
                return pairs
    return pairs


def get_player_seasons(player_id: int, player: dict[str, Any]) -> list[dict[str, Any]]:
    seasons_data = sofa_json(f"/player/{player_id}/statistics/seasons")
    seasons = []
    for pair in player_season_pairs(seasons_data):
        try:
            unique_id = pair["uniqueTournament"]["id"]
            season_id = pair["season"]["id"]
            stats_data = sofa_json(f"/player/{player_id}/unique-tournament/{unique_id}/season/{season_id}/statistics/overall")
            mapped = map_season_stats(stats_data, pair, player)
            if mapped and (mapped["matchesPlayed"] > 0 or mapped["minutes"] > 0 or mapped["goals"] > 0 or mapped["assists"] > 0):
                seasons.append(mapped)
        except Exception:
            continue
    return seasons


def handle_action(body: dict[str, Any]) -> Any:
    action = body.get("action")

    if action == "standings":
        tournament_id = unique_tournament_id_from_url(str(body.get("leagueUrl") or ""))
        season_id = get_current_season_id(tournament_id)
        table_type = body.get("tableType") if body.get("tableType") in {"total", "home", "away"} else "total"
        data = sofa_json(f"/unique-tournament/{tournament_id}/season/{season_id}/standings/{table_type}")
        standings = data.get("standings") or []
        rows = []
        for standing in standings:
            group_name = standing.get("name") or standing.get("groupName")
            for row in standing.get("rows") or []:
                rows.append((row, group_name))
        return {
            "format": "groups" if len(standings) > 1 else "table",
            "groups": [s.get("name") or s.get("groupName") for s in standings if s.get("name") or s.get("groupName")],
            "teams": [
                {
                    "position": row.get("position") or index + 1,
                    "id": row.get("team", {}).get("id") or row.get("id") or index + 1000,
                    "name": row.get("team", {}).get("name") or "Unknown",
                    "shortName": row.get("team", {}).get("shortName") or row.get("team", {}).get("nameCode") or "UNK",
                    "imageUrl": team_image_url(row.get("team", {}).get("id") or row.get("id")),
                    "groupName": group_name,
                    "played": row.get("matches") or 0,
                    "wins": row.get("wins") or 0,
                    "draws": row.get("draws") or 0,
                    "losses": row.get("losses") or 0,
                    "scored": row.get("scoresFor") or 0,
                    "conceded": row.get("scoresAgainst") or 0,
                    "points": row.get("points") or 0,
                }
                for index, (row, group_name) in enumerate(rows)
            ],
        }

    if action in {"matches_last", "matches_next"}:
        tournament_id = unique_tournament_id_from_url(str(body.get("leagueUrl") or ""))
        season_id = get_current_season_id(tournament_id)
        endpoint = "last" if action == "matches_last" else "next"
        data = sofa_json(f"/unique-tournament/{tournament_id}/season/{season_id}/events/{endpoint}/0")
        events = [map_event(event) for event in data.get("events") or []]
        return sorted(events, key=lambda item: item["startTimestamp"], reverse=endpoint == "last")

    if action == "live":
        data = sofa_json("/sport/football/events/live")
        return [
            {
                **map_event(event),
                "homeScore": (event.get("homeScore") or {}).get("current") or 0,
                "awayScore": (event.get("awayScore") or {}).get("current") or 0,
                "status": "Live",
                "minute": None,
                "period": (event.get("status") or {}).get("description"),
                "country": event_country(event),
            }
            for event in data.get("events") or []
            if (event.get("status") or {}).get("type") == "inprogress"
        ]

    if action == "today_matches":
        today_iso = today_local_iso()
        data = sofa_json(f"/sport/football/scheduled-events/{today_iso}")
        events = sorted(
            [
                event for event in data.get("events") or []
                if local_iso_from_timestamp(int(event.get("startTimestamp") or 0)) == today_iso
            ],
            key=lambda event: event.get("startTimestamp") or 0,
        )
        return [
            {
                **map_event(event),
                "startTimestamp": event.get("startTimestamp") or 0,
                "time": format_time(int(event.get("startTimestamp") or 0)) if event.get("startTimestamp") else None,
                "country": event_country(event),
            }
            for event in events
        ]

    if action == "event_goal_incidents":
        event_id = int(body.get("eventId") or 0)
        if not event_id:
            raise ValueError("eventId obrigatorio")
        data = sofa_json(f"/event/{event_id}/incidents")
        incidents = []
        for incident in data.get("incidents") or []:
            if str(incident.get("incidentType") or "").lower() != "goal":
                continue
            incidents.append({
                "id": str(incident.get("id") or f"{incident.get('time', 'goal')}-{incident.get('homeScore', '')}-{incident.get('awayScore', '')}"),
                "playerName": (incident.get("player") or {}).get("name") or (incident.get("player") or {}).get("shortName") or incident.get("playerName") or "",
                "teamSide": "home" if incident.get("isHome") is True else "away" if incident.get("isHome") is False else None,
                "homeScore": incident.get("homeScore") if isinstance(incident.get("homeScore"), int) else None,
                "awayScore": incident.get("awayScore") if isinstance(incident.get("awayScore"), int) else None,
                "time": incident.get("time") if isinstance(incident.get("time"), int) else None,
                "incidentClass": incident.get("incidentClass"),
            })
        return sorted(incidents, key=lambda item: item.get("time") or 0, reverse=True)

    if action == "top_players":
        tournament_id = unique_tournament_id_from_url(str(body.get("leagueUrl") or ""))
        season_id = get_current_season_id(tournament_id)
        metric = str(body.get("metric") or "goals")
        data = sofa_json(f"/unique-tournament/{tournament_id}/season/{season_id}/top-players/overall")
        players = ((data.get("topPlayers") or {}).get(metric) or [])[:12]
        return [
            {
                "id": (item.get("player") or {}).get("id") or item.get("id"),
                "name": (item.get("player") or {}).get("shortName") or (item.get("player") or {}).get("name") or "Jogador",
                "fullName": (item.get("player") or {}).get("name") or (item.get("player") or {}).get("shortName") or "Jogador",
                "imageUrl": player_image_url((item.get("player") or {}).get("id") or item.get("id")),
                "team": (item.get("team") or {}).get("shortName") or (item.get("team") or {}).get("name") or "",
                "value": float((item.get("statistics") or {}).get(metric) or 0),
                "goals": float((item.get("statistics") or {}).get("goals") or 0),
                "assists": float((item.get("statistics") or {}).get("assists") or 0),
                "appearances": float((item.get("statistics") or {}).get("appearances") or (item.get("statistics") or {}).get("matchesStarted") or 0),
                "rating": float((item.get("statistics") or {}).get("rating") or 0),
            }
            for item in players
        ]

    if action == "player_search":
        query = str(body.get("query") or "")
        items = []
        for path in (f"/search/players?q={urllib.parse.quote(query)}&page=0", f"/search/all?q={urllib.parse.quote(query)}&page=0"):
            try:
                items.extend(extract_players_from_search(sofa_json(path), query))
            except Exception:
                pass
        by_id = {}
        for item in items:
            player = item["player"]
            current = by_id.get(player["id"])
            if not current or item["score"] > current["score"]:
                by_id[player["id"]] = item
        return [
            {
                "id": item["player"]["id"],
                "name": item["player"].get("name") or item["player"].get("shortName") or query,
                "url": player_url(item["player"]),
                "description": " - ".join(filter(None, [map_position(item["player"].get("position")), (item["player"].get("team") or {}).get("name"), (item["player"].get("country") or {}).get("name")])),
                "imageUrl": player_image_url(item["player"]["id"]),
                "team": (item["player"].get("team") or {}).get("name") or "",
                "age": player_age(item["player"]),
            }
            for item in sorted(by_id.values(), key=lambda row: row["score"], reverse=True)[:12]
        ]

    if action == "team_players":
        team = find_football_team(str(body.get("teamName") or ""))
        if not team:
            return []
        data = sofa_json(f"/team/{team['id']}/players")
        players = []
        for row in data.get("players") or []:
            player = row.get("player") or row
            players.append({
                "id": player.get("id"),
                "name": player.get("name") or player.get("shortName") or "",
                "imageUrl": player_image_url(player.get("id")),
                "position": map_position(player.get("position")),
                "shirtNumber": int(player.get("jerseyNumber")) if player.get("jerseyNumber") else None,
                "nationality": (player.get("country") or {}).get("name") or "",
                "age": player_age(player),
                "url": player_url(player),
            })
        return players

    if action == "team_next_matches":
        ids = [int(value) for value in body.get("teamIds") or [] if str(value).isdigit()]
        for name in body.get("teamNames") or []:
            team = find_football_team(str(name))
            if team and team.get("id"):
                ids.append(int(team["id"]))
        matches = {}
        for team_id in list(dict.fromkeys(ids))[:6]:
            try:
                data = sofa_json(f"/team/{team_id}/events/next/0")
                for event in data.get("events") or []:
                    mapped = map_event(event)
                    matches[mapped["id"]] = mapped
            except Exception:
                continue
        return sorted(matches.values(), key=lambda item: item.get("startTimestamp") or 0)[:20]

    if action == "player_stats":
        player_id = extract_player_id(str(body.get("playerUrl") or ""))
        if not player_id:
            raise ValueError("URL de jogador invalida")
        detail = sofa_json(f"/player/{player_id}")
        player = detail.get("player") or {}
        return {
            "name": player.get("name") or player.get("shortName") or "",
            "team": (player.get("team") or {}).get("name") or "",
            "position": map_position(player.get("position")),
            "imageUrl": player_image_url(player.get("id")),
            "nationality": (player.get("country") or {}).get("name") or "",
            "age": player_age(player),
            "height": f"{player['height']} cm" if player.get("height") else "",
            "foot": player.get("preferredFoot") or "",
            "shirtNumber": int(player.get("jerseyNumber")) if player.get("jerseyNumber") else None,
            "seasons": get_player_seasons(player_id, player),
        }

    if action == "odds":
        return []

    if action == "health":
        _scraper()
        return {"ok": True, "source": "ScraperFC"}

    raise ValueError(f"Acao desconhecida: {action}")


class ScraperFcHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):  # noqa: N802
        _send_json(self, {})

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            try:
                _scraper()
                _send_json(self, {"ok": True, "source": "ScraperFC"})
            except Exception as exc:
                _send_json(self, {"ok": False, "error": str(exc)}, 503)
            return
        if parsed.path == "/sofascore":
            query = urllib.parse.parse_qs(parsed.query)
            path = query.get("path", [""])[0]
            try:
                _send_json(self, sofa_json(path))
            except Exception as exc:
                _send_json(self, {"error": str(exc), "trace": traceback.format_exc()}, 500)
            return
        _send_json(self, {"error": "not found"}, 404)

    def do_POST(self):  # noqa: N802
        if urllib.parse.urlparse(self.path).path != "/sports-data":
            _send_json(self, {"error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            _scraper()
            _send_json(self, handle_action(body))
        except Exception as exc:
            _send_json(self, {"error": str(exc), "trace": traceback.format_exc()}, 500)

    def log_message(self, fmt: str, *args: Any):
        sys.stderr.write(f"[scraperfc] {fmt % args}\n")


def main():
    port = int(os.environ.get("SCRAPERFC_PORT") or DEFAULT_PORT)
    server = ThreadingHTTPServer(("127.0.0.1", port), ScraperFcHandler)
    print(f"ScraperFC bridge listening at http://127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
