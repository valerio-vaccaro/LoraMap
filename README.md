# 📡 LoraMap

An authenticated web platform that visualises LoRa device positions on a live map, built with **Flask · SQLAlchemy · Google Maps**.

---

## ✨ Features

| | |
|---|---|
| 🔐 | Cookie-based login / register — new accounts require manual DB activation |
| 🗺️ | Google Maps view — full trajectory **or** last-position-only, one colour per device |
| 🔍 | Filter by device and time range; click any marker for details (battery, RSSI, SF, BW…) |
| 📊 | Dashboard table with last-known state per device + live battery & RSSI charts |
| 📥 | TTN HTTP Storage API integration — fetch and store uplink messages with deduplication |
| 🔌 | Pluggable decoder system — each data source selects its own device decoder |
| 🖥️ | CLI ingestion script for bulk-loading NDJSON files |

---

## 🚀 Quick Start

### 1 · Install dependencies

```bash
pip install -r requirements.txt
```

### 2 · Configure environment

```bash
cp .env.example .env
# edit .env: set DATABASE_URL, SECRET_KEY, GOOGLE_MAPS_API_KEY
```

> **SQLite (zero-config):** leave `DATABASE_URL` as `sqlite:///loramap.db`
> **MySQL:** create the DB first (`CREATE DATABASE loramap;`) then set `DATABASE_URL=mysql+pymysql://user:pass@localhost/loramap`

### 3 · Initialise the database

```bash
flask db upgrade
```

### 4 · Run

```bash
flask run
```

Open [http://localhost:5000](http://localhost:5000).

---

## 👤 User accounts

1. Register at `/register`.
2. An admin must activate the account:
   ```sql
   UPDATE users SET activated = 1 WHERE username = 'yourname';
   ```
3. Log in — done.

---

## 📥 Data sources

Go to **Sources** in the nav bar and add a TTN HTTP Storage endpoint.

| Field | Example |
|-------|---------|
| 📛 Name | `My Tracker App` |
| 🔗 API URL | `https://eu1.cloud.thethings.network/api/v3/as/applications/<app-id>/packages/storage/uplink_message` |
| 🔑 Bearer Token | `NNSXS.…` |
| ⏱️ Time Window | `12h`, `24h`, `7d` |
| 🔌 Device / Decoder | e.g. *SenseCap T1000-A/B (TTN)* |

Click **↻ Fetch** to pull data immediately, or use **Fetch New Data** on the map page.

---

## 📦 Bulk ingestion (CLI)

```bash
# from a file
python ingest.py data.ndjson

# from stdin (pipe the TTN curl command)
curl -G "https://…" \
     -H "Authorization: Bearer …" \
     -H "Accept: text/event-stream" \
     -d "last=12h" \
  | python ingest.py
```

---

## 🔌 Decoder system

Each data source has a **decoder type** that controls how raw uplink payloads are parsed. This makes it easy to support multiple device models.

### 📂 Package layout

```
decoders/
├── __init__.py
├── base.py            BaseDecoder — abstract interface (decode → dict | None)
├── ttn_base.py        TTNBaseDecoder — shared TTN envelope + radio metadata
├── sensecap_t1000a.py SensecapT1000ADecoder — SenseCap T1000-A/B payload
└── registry.py        DECODERS dict · get_decoder() · DECODER_CHOICES
```

### ➕ Adding a new decoder

1. Create `decoders/mydevice.py`:

```python
from .ttn_base import TTNBaseDecoder   # or BaseDecoder for non-TTN sources

class MyDeviceDecoder(TTNBaseDecoder):
    NAME  = 'my_device'
    LABEL = 'My Device (TTN)'

    def _decode_payload(self, uplink: dict) -> dict | None:
        decoded = uplink.get('decoded_payload') or {}
        return {
            'latitude':  decoded.get('lat'),
            'longitude': decoded.get('lon'),
            'battery':   decoded.get('battery'),
        }
```

2. Register it in `decoders/registry.py`:

```python
from .mydevice import MyDeviceDecoder

DECODERS = {
    d.NAME: d for d in [
        SensecapT1000ADecoder(),
        MyDeviceDecoder(),        # ← add here
    ]
}
```

The new decoder appears automatically in the **Data Sources** dropdown — no other changes needed.

### 📡 SenseCap T1000-A/B measurement IDs

| ID | Meaning |
|----|---------|
| `4197` | 📍 Longitude |
| `4198` | 📍 Latitude |
| `3000` | 🔋 Battery (%) |
| `3576` | 📶 Positioning Status |

RSSI comes from `rx_metadata[0].rssi`; spreading factor and bandwidth from `settings.data_rate.lora`.

---

## 🗂️ Project structure

```
LoraMap/
├── app.py               Flask application & routes
├── models.py            SQLAlchemy models (User · DataSource · UplinkMessage)
├── utils.py             NDJSON parser & DB ingestion helpers
├── config.py            Configuration (reads .env)
├── ingest.py            CLI ingestion script
├── decoders/            Pluggable device decoders (see above)
├── migrations/          Flask-Migrate / Alembic versions
├── requirements.txt
├── .env.example
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── register.html
│   ├── map.html
│   ├── dashboard.html
│   ├── datasources.html
│   ├── data.html
│   └── profile.html
└── static/
    ├── css/style.css
    └── js/
        ├── map.js
        └── dashboard.js
```

---

## ⚙️ Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `dev-secret-key-…` | Flask session secret — **change in production** |
| `DATABASE_URL` | `sqlite:///loramap.db` | SQLAlchemy DB URI |
| `GOOGLE_MAPS_API_KEY` | *(empty)* | Google Maps JavaScript API key |
