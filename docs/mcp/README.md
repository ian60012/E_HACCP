# Read-only MCP server

`mcp_server/` is a separate Python service. It speaks [Model Context Protocol](https://modelcontextprotocol.io) over streamable HTTP so an assistant on the tailnet can query HACCP records. It does not modify the FastAPI application.

The endpoint is `http://<host>:8765/mcp`. A process health check at `/healthz` returns `{"status":"ok"}` and no HACCP data.

## Tools

Every tool is read-only. Signature images and secrets are removed before the result is returned.

| Tool | What it returns |
| --- | --- |
| `health_and_schema` | API health, the service-account identity, a schema summary, and whether the read-only database role is connected. |
| `list_records` | Records for `receiving`, `cooking`, `cooling`, `sanitising`, `cleaning`, `mixing`, `ppe`, `assembly`, `deviation`, `batch`, `batch_sheet`, or `quality`. Optional inclusive `date_from` and `date_to`. Without dates, only the newest page is read. |
| `get_record` | One record. `log_type` also accepts `ncr` (a deviation) and `label` (one LabelMaker template). |
| `find_attention_records` | Unsigned, unreviewed, unlocked, incomplete, overdue, or open CAPA rows in a date window. A missing signature on an old row is reported, not judged. |
| `trace_lot` | Receiving lot to production batch to inventory movements. Provide `lot_code`, `receiving_log_id`, `prod_batch_id`, `batch_code`, or `supplier_batch_no`. |
| `list_ccp_deviations` | Cooking and cooling CCP failures, receiving rejections and holds, failed ATP results, and the deviation rows in the same dates, including corrective-action text. |
| `list_ncr` | Nonconformance list. These are `deviation_logs`. There is no NCR table. |
| `get_ncr` | One deviation, including root cause, preventive action, and closure. |
| `audit_period_summary` | Counts of records created in the period from `GET /admin/activity`, plus `audit_log` action counts when the read-only role is configured. Change payloads are not returned. |
| `list_label_templates` | Template names, pack size, shelf life, and allergen tags. Recipe text stays out of the list. |

Default page size is 25 and the hard cap is 100. Date scans stop after 2,000 rows and say `truncated`. Attention windows are limited to 92 days. Other ranges are limited to 366 days.

`trace_lot` uses the read-only SQL role when `HACCP_READONLY_DATABASE_URL` is set (`source=auto`). Otherwise it uses the API and may return `truncated` because lot and movement lists have no exact key filter. `OUT` movements are the dispatch record. This database has no shipment table.

## Auth and audit

Two credentials are involved:

1. `MCP_BEARER_TOKEN` protects the MCP endpoint. Clients send `Authorization: Bearer <token>`. The comparison is constant-time. The process exits if the token is missing or shorter than 16 characters. The raw token is not written to the audit log. Its SHA-256 prefix is the `token_fp`.
2. `HACCP_SERVICE_USERNAME` and `HACCP_SERVICE_PASSWORD` belong to a normal E_HACCP user. The server logs in with the password form, caches the 30-minute JWT, and logs in again after a 401. Create this user in the existing admin screen. Use a dedicated account. Admin is required for the activity feed. QA can read the logs but receives 403 from `/admin/activity`.

The service-account JWT could still call write APIs if something else used the password. This process refuses every method except `GET` and the login `POST`. Put the password only in the NAS environment, not in an assistant prompt.

Each tool call appends one JSON object to stdout and, when `MCP_AUDIT_LOG_PATH` is set, to that file. The object contains `ts`, `tool`, redacted `args`, `caller` (`X-MCP-Caller` plus `token_fp`), `ok`, and `duration_ms`. Set `X-MCP-Caller` to the person or assistant name so the log can be reviewed later.

`/healthz` is unauthenticated and is only for the container health check.

## Optional read-only database role

Most tools work through the API. Two gaps need SQL if you want exact answers:

- `audit_log` has no REST reader.
- Lot-to-movement traceability has no exact list filter.

Review and run `mcp_server/sql/create_readonly_role.sql` yourself, as a superuser, after replacing the password. The MCP process does not run it, and it is not a migration. The role `haccp_mcp_ro` receives `SELECT` on the listed tables, `default_transaction_read_only=on`, and a 5 second statement timeout. It is not granted `users`. Names are available through the view `haccp_mcp_users`, which has no `password_hash`.

Then set:

```text
# prod compose network; the dev Postgres listens on 5555 instead of 5432
HACCP_READONLY_DATABASE_URL=postgresql://haccp_mcp_ro:<password>@postgres:5432/haccp_db
```

The server also sends `SET LOCAL transaction_read_only = on` and will only execute its own `SELECT` statements. After a future migration adds a table, re-run the `GRANT` block. New tables are not granted automatically.

## NAS deployment

The service is opt-in. Plain `docker compose up` does not start it. Do not add it to the Railway image or publish it on a public interface.

1. Create the service user in the E_HACCP admin UI and, if you want `audit_log` and exact traces, apply the SQL above on the NAS database.
2. Copy `mcp_server/.env.example` values into the shell environment used by compose. Generate `MCP_BEARER_TOKEN` with at least 16 random characters.
3. Bind the published port to loopback or the Tailscale address, never `0.0.0.0`. The server exits if `MCP_PUBLISH_HOST` is `0.0.0.0`.

```bash
export MCP_BEARER_TOKEN='replace-with-a-long-random-token'
export HACCP_SERVICE_USERNAME='mcp-reader'
export HACCP_SERVICE_PASSWORD='replace-with-the-service-account-password'
export MCP_PUBLISH_HOST='100.x.x.x'          # Tailscale IP of the NAS
export MCP_PUBLISH_PORT='8765'
export MCP_ALLOWED_HOSTS='127.0.0.1:*,localhost:*,100.x.x.x:*'
export MCP_RESOURCE_URL='http://100.x.x.x:8765'
# optional
export HACCP_READONLY_DATABASE_URL='postgresql://haccp_mcp_ro:PASSWORD@postgres:5432/haccp_db'

docker compose -f docker-compose.prod.yml --profile mcp up -d --build mcp
```

Inside the container the process listens on `0.0.0.0` so Docker can publish it. The host publish address is `MCP_PUBLISH_HOST`. On the dev compose file the container name is `haccp_mcp`; in prod it is `haccp_prod_mcp`.

`MCP_ALLOWED_HOSTS` is the DNS-rebinding allow list and must include the host clients actually send. Confirm from another tailnet device that the port is reachable, and from a public network that it is not.

If the NAS compose binary is older than 1.28 and does not understand `profiles`, start only this service with a current Docker Compose v2 binary rather than removing the profile. Removing the profile would start the MCP whenever the rest of the stack starts.

Audit lines are in `docker logs haccp_prod_mcp` and in the `mcp_audit_prod` volume at `/var/log/ehaccp-mcp/audit.jsonl`.

## Connect a client

Cursor, or another streamable-HTTP client, on the tailnet:

```json
{
  "mcpServers": {
    "ehaccp": {
      "url": "http://100.x.x.x:8765/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_BEARER_TOKEN>",
        "X-MCP-Caller": "your-name"
      }
    }
  }
}
```

For a laptop that is not on the tailnet, keep `MCP_PUBLISH_HOST=127.0.0.1` and use an SSH tunnel to the NAS. Do not open the port on the router.

## Local checks

```bash
cd mcp_server
python -m pip install -r requirements-dev.txt
python -m pytest
```

The image installs `requirements.txt` only. Backend unit tests are unchanged and do not import this package.

## Not in this version

Write tools are not implemented. A later change would have to stay draft-only, require a separate human confirmation, and refuse any row that is QA locked, verified, or signed. See the pull request for the proposed list. This server will not grow those tools by configuration.
