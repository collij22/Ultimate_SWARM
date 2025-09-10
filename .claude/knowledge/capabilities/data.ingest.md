# Capability: data.ingest — DuckDB recipe

## Inputs

- CSV/Parquet files in `briefs/<id>/data/*`

## Steps

1. Create DuckDB DB at `runs/<AUV>/data/db.duckdb`.
2. COPY/READ CSV into table `raw_data` with header detection.
3. Emit `runs/<AUV>/data/processed/row_count.json` with total rows.
4. Write checksum manifest for inputs to `runs/<AUV>/data/checksums.json`.

## Outputs

- `runs/<AUV>/data/db.duckdb`
- `runs/<AUV>/data/processed/row_count.json`
- `runs/<AUV>/data/checksums.json`

## Acceptance

- row_count ≥ 100 (configurable), checksums present.
