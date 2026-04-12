"""
Async HTTP client for X/Twitter private endpoints (auth_token + ct0 cookies).
Used by twitter_api.api.* modules.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Union

import aiohttp

from ..utils.constants import PROFILE_HEADERS


def _flatten_graphql_query_params(json_data: Dict[str, Any]) -> Dict[str, str]:
    """GraphQL GET helpers pass variables/features as JSON-encoded query strings."""
    out: Dict[str, str] = {}
    for key, value in json_data.items():
        if value is None:
            continue
        if isinstance(value, (dict, list)):
            out[key] = json.dumps(value, separators=(",", ":"))
        else:
            out[key] = str(value)
    return out


class TwitterAPIClient:
    """
    Minimal aiohttp wrapper: GET/POST with Twitter web headers and cookies.
    """

    def __init__(
        self,
        auth_token: Optional[str] = None,
        ct0: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        if headers is not None:
            self.headers = dict(headers)
            return
        self.headers = {k: str(v) for k, v in PROFILE_HEADERS.items()}
        tok = (auth_token or "").strip()
        c = (ct0 or "").strip()
        self.headers["cookie"] = f"auth_token={tok}; ct0={c}"
        if c:
            self.headers["x-csrf-token"] = c

    async def fetch_csrf_token(self) -> Optional[str]:
        """Return existing ct0 from headers if present (no network fetch)."""
        existing = (self.headers.get("x-csrf-token") or "").strip()
        return existing or None

    async def post(
        self,
        url: str,
        json_data: Optional[Dict[str, Any]] = None,
        data: Optional[Union[Dict[str, Any], aiohttp.FormData]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        return await self._request("POST", url, params=params, json=json_data, data=data)

    async def get(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> Any:
        merged = dict(params or {})
        if json_data:
            merged.update(_flatten_graphql_query_params(json_data))
        return await self._request("GET", url, params=merged or None, json=None, data=data)

    async def _request(
        self,
        method: str,
        url: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        data: Any = None,
    ) -> Any:
        timeout = aiohttp.ClientTimeout(total=90)
        headers = dict(self.headers)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(
                method,
                url,
                headers=headers,
                params=params,
                json=json,
                data=data,
            ) as resp:
                text = await resp.text()
                ct = (resp.headers.get("Content-Type") or "").lower()
                if "application/json" in ct:
                    try:
                        return json.loads(text)
                    except json.JSONDecodeError:
                        return None
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return None
