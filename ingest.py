#!/usr/bin/env python3
"""Standalone data ingestion script for LoraMap.

Usage:
    python ingest.py data.ndjson       # ingest from file
    cat data.ndjson | python ingest.py  # ingest from stdin
"""
import sys

from app import app
from utils import parse_lines


def main():
    if len(sys.argv) > 1:
        source = open(sys.argv[1], 'r', encoding='utf-8')
    else:
        source = sys.stdin

    with app.app_context():
        inserted, skipped = parse_lines(source)

    print(f'Inserted: {inserted}, Skipped (duplicates/invalid): {skipped}')

    if len(sys.argv) > 1:
        source.close()


if __name__ == '__main__':
    main()
