import os
import threading
import time
from typing import Any, Dict, List, Optional

import requests
from msal import ConfidentialClientApplication

from app.runtime_logger import emit


class DataverseClient:
    """Client for querying Dataverse tables using MSAL client-credentials."""

    def __init__(self):
        self._base_url = os.getenv("DATAVERSE_BASE_URL", "").rstrip("/")
        if not self._base_url:
            raise RuntimeError("DATAVERSE_BASE_URL must be set")

        tenant_id = os.getenv("ENTRA_TENANT_ID")
        client_id = os.getenv("ENTRA_CLIENT_ID")
        client_secret = os.getenv("ENTRA_CLIENT_SECRET")
        if not tenant_id or not client_id or not client_secret:
            raise RuntimeError("ENTRA_TENANT_ID/ENTRA_CLIENT_ID/ENTRA_CLIENT_SECRET must be set")

        self._cca = ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret,
        )
        self._token_lock = threading.Lock()
        self._cached_token: Optional[str] = None
        self._cached_token_expires_at: float = 0.0

    def _get_token(self) -> str:
        now = time.time()
        if self._cached_token and now < (self._cached_token_expires_at - 60):
            return self._cached_token

        with self._token_lock:
            now = time.time()
            if self._cached_token and now < (self._cached_token_expires_at - 60):
                return self._cached_token

            scopes = [f"{self._base_url}/.default"]
            result = self._cca.acquire_token_silent(scopes, account=None)
            if not result:
                result = self._cca.acquire_token_for_client(scopes=scopes)
            access_token = result.get("access_token")
            if not access_token:
                emit("ERROR", "DATAVERSE", "Dataverse token acquisition failed")
                raise RuntimeError("Failed to acquire Dataverse token")

            expires_in = result.get("expires_in")
            if isinstance(expires_in, (int, float)):
                self._cached_token_expires_at = time.time() + float(expires_in)
            else:
                self._cached_token_expires_at = time.time() + 55 * 60
            self._cached_token = access_token
            return access_token

    def fetch_table(
        self,
        entity_set: str,
        select: Optional[str] = None,
        filter: Optional[str] = None,
        top: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch rows from a Dataverse table (entity set).

        Args:
            entity_set: The plural entity set name (e.g. 'cr6c3_table11s').
            select: Comma-separated column names to return.
            filter: OData $filter expression.
            top: Max rows to return.
        """
        headers = {
            "Authorization": f"Bearer {self._get_token()}",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json",
            "Prefer": "odata.include-annotations=*",
        }

        url = f"{self._base_url}/api/data/v9.2/{entity_set}"
        params: List[str] = []
        if select:
            params.append(f"$select={select}")
        if filter:
            params.append(f"$filter={filter}")
        if top:
            params.append(f"$top={top}")
        if params:
            url += "?" + "&".join(params)

        all_rows: List[Dict[str, Any]] = []
        next_url: Optional[str] = url

        while next_url:
            emit("INFO", "DATAVERSE", f"Fetching: {next_url}")
            resp = requests.get(next_url, headers=headers, timeout=(10, 60))

            if not resp.ok:
                text = resp.text[:400] if resp.text else "request_failed"
                emit("ERROR", "DATAVERSE", f"Dataverse request failed: status={resp.status_code} error={text}")
                raise RuntimeError(f"Dataverse request failed ({resp.status_code}): {text}")

            data = resp.json()
            all_rows.extend(data.get("value", []))
            next_url = data.get("@odata.nextLink")

        emit("INFO", "DATAVERSE", f"Fetched {len(all_rows)} rows from {entity_set}")
        return all_rows

    def patch_row(self, entity_set: str, row_id: str, data: Dict[str, Any]) -> None:
        """Update a single Dataverse row by its primary key.

        Args:
            entity_set: The plural entity set name (e.g. 'cr6c3_table11s').
            row_id: The GUID primary key of the row.
            data: Dict of column names → new values to update.
        """
        headers = {
            "Authorization": f"Bearer {self._get_token()}",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Content-Type": "application/json",
            "If-Match": "*",  # allow update regardless of ETag
        }
        url = f"{self._base_url}/api/data/v9.2/{entity_set}({row_id})"
        emit("INFO", "DATAVERSE", f"Patching row: {entity_set}({row_id}) data={data}")
        resp = requests.patch(url, headers=headers, json=data, timeout=(10, 30))
        if not resp.ok:
            text = resp.text[:400] if resp.text else "request_failed"
            emit("ERROR", "DATAVERSE", f"Dataverse PATCH failed: status={resp.status_code} error={text}")
            raise RuntimeError(f"Dataverse PATCH failed ({resp.status_code}): {text}")
        emit("INFO", "DATAVERSE", f"Patched row: {entity_set}({row_id})")
