# LoraMap

Authenticated Flask application for LoRa device tracking, telemetry storage, and per-user device dashboards.

## Features

- Cookie-based user authentication with manual account activation
- Google Maps position view and tracker view
- Dashboard with latest per-device status and charts
- `Sensors` page with filters, charts, and tables for:
  - battery percentage
  - battery voltage
  - internal temperature
  - external temperature
  - humidity
  - luminosity
- TTN HTTP Storage API ingestion with deduplication
- Pluggable decoder system per datasource
- User-specific device colors and short names
- User-generated access tokens for latest-message access to selected devices only

## Supported decoders

- `sensecap_t1000a` → SenseCap T1000-A/B (TTN)
- `dragino_lht65` → Dragino LHT65 (TTN)

The Dragino LHT65 decoder maps:

- `air_temperature` = internal `TempC_SHT`
- `external_temperature` = `TempC_DS`
- `humidity` = `Hum_SHT`
- `battery_voltage` = `BatV`
- `battery` = `last_battery_percentage.value` when available, otherwise a voltage-based estimate

## Quick start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

Create `.env` and set at least:

```env
SECRET_KEY=change-me
DATABASE_URL=sqlite:///loramap.db
GOOGLE_MAPS_API_KEY=
```

Notes:

- SQLite works out of the box.
- For MySQL, create the database first and use a SQLAlchemy URL such as `mysql+pymysql://user:pass@localhost/loramap`.

### 3. Apply database migrations

```bash
flask db upgrade
```

This is required for the latest changes, including:

- extra LHT65 sensor columns
- performance indexes
- device access token tables

### 4. Run the app

```bash
flask run
```

Open `http://localhost:5000`.

## User accounts

1. Register at `/register`
2. Activate the user manually in the database

```sql
UPDATE users SET activated = 1 WHERE username = 'yourname';
```

3. Log in

## Datasources

Add datasources from the `Sources` page.

Required fields:

- `Name`
- `API URL`
- `Bearer Token`

Optional/config fields:

- `Time Window` like `12h`, `24h`, `7d`
- `Device / Decoder`

Example TTN storage URL:

```text
https://eu1.cloud.thethings.network/api/v3/as/applications/<app-id>/packages/storage/uplink_message
```

## Sensor page

The `Sensors` page shows telemetry rows and charts with shared filters:

- device
- time range
- battery min/max
- battery voltage min/max
- internal temperature min/max
- external temperature min/max
- humidity min/max
- luminosity min/max

## Access tokens for latest device messages

Users can create named random tokens from the `Profile` page.

Each token:

- belongs to exactly one user
- can be locked/unlocked
- can be deleted
- is restricted to an explicit allowlist of that user’s devices
- cannot access devices belonging to other users

The raw token is shown once at creation time only. The database stores only a SHA-256 hash.

### External endpoint

```text
GET /api/access/last_messages
```

Authentication methods:

- `Authorization: Bearer <token>`
- `X-Access-Token: <token>`
- query string `?token=<token>`

Optional device filter:

```text
?devices=deviceA,deviceB
```

Behavior:

- if no `devices` filter is passed, the endpoint returns the latest message for every device allowed by the token
- if `devices` is passed, every requested device must be inside the token allowlist
- locked or invalid tokens return `403`

Example:

```bash
curl \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/access/last_messages?devices=device-1,device-2"
```

Example returning the latest messages for all devices allowed by the token:

```bash
TOKEN="paste_the_token_shown_once_in_profile"

curl \
  -H "Authorization: Bearer ${TOKEN}" \
  "http://localhost:5000/api/access/last_messages"
```

Example using query-string auth and a single selected device:

```bash
curl \
  "http://localhost:5000/api/access/last_messages?token=${TOKEN}&devices=a840412ad182d40a"
```

## API notes

The OpenAPI document is in [docs/openapi.yaml](docs/openapi.yaml).

Main authenticated endpoints:

- `/api/stats`
- `/api/positions`
- `/api/devices`
- `/api/device_colors`
- `/api/device_names`
- `/api/chart_data`
- `/api/messages/range`
- `/api/messages`
- `/api/fetch_all`

Token-authenticated endpoint:

- `/api/access/last_messages`

## Bulk ingestion

From a file:

```bash
python ingest.py data.ndjson
```

From TTN storage streamed NDJSON:

```bash
curl -G "https://..." \
  -H "Authorization: Bearer ..." \
  -H "Accept: text/event-stream" \
  -d "last=12h" \
  | python ingest.py
```

Note:

- the normal ingestion path expects line-delimited JSON / TTN storage output
- TTN-style bare uplink objects are supported by TTN decoders

## Decoder architecture

Relevant files:

```text
decoders/
├── base.py
├── ttn_base.py
├── sensecap_t1000a.py
├── dragino_lht65.py
└── registry.py
```

- `BaseDecoder` defines the normalized output contract
- `TTNBaseDecoder` handles TTN envelope parsing and radio metadata
- each datasource selects one decoder type
- decoder registry controls the dropdown choices shown in the UI

To add a new decoder:

1. Create a module in `decoders/`
2. Return normalized fields from `decode()` or `_decode_payload()`
3. Register it in `decoders/registry.py`

## Project structure

```text
LoraMap/
├── app.py
├── models.py
├── utils.py
├── config.py
├── ingest.py
├── decoders/
├── docs/
│   └── openapi.yaml
├── migrations/
├── static/
├── templates/
└── requirements.txt
```

## Environment variables

- `SECRET_KEY`: Flask session secret
- `DATABASE_URL`: SQLAlchemy database URL
- `GOOGLE_MAPS_API_KEY`: Google Maps JS API key
