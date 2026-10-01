"""Schemat tworzony przy starcie musi obejmować wszystko, czego używa SQL.

Na świeżej bazie (nowe środowisko, staging) zapis portfela kończył się
błędem 500: kod czytał i zapisywał kolumnę portfolio_holdings.asset_type
oraz tabelę portfolio_other_assets, których start serwera nigdy nie tworzył
(istniały tylko na produkcji). Test porównuje tabele i kolumny z INSERT/
SELECT z tym, co tworzą CREATE TABLE i ALTER TABLE … ADD COLUMN.
Bez bazy — czysta analiza tekstu server.py.
"""
import re
import sys
from pathlib import Path

src = (Path(__file__).parent / 'server.py').read_text()

TYPES = r'(?:TEXT|NUMERIC|INT|INTEGER|BIGINT|BOOLEAN|DATE|TIMESTAMP|TIMESTAMPTZ|SERIAL|BIGSERIAL|DOUBLE|REAL|JSONB|JSON)'
cols = {}
for m in re.finditer(r'CREATE TABLE IF NOT EXISTS (\w+)\s*\((.*?)\n\s*\)"""', src, re.S):
    cols[m.group(1)] = set(re.findall(rf'^\s*(\w+)\s+{TYPES}', m.group(2), re.M))
for m in re.finditer(r'ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)', src):
    cols.setdefault(m.group(1), set()).add(m.group(2))

fails = []

used_tables = {m.group(1) for m in re.finditer(r'\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z]+_[a-z_]+|users|sessions)\b', src)}
for t in sorted(used_tables - set(cols)):
    fails.append(f'tabela {t} używana, ale nie tworzona przy starcie')

for m in re.finditer(r'INSERT INTO (\w+)\s*\(([^)]*)\)', src):
    t = m.group(1)
    for c in (x.strip() for x in m.group(2).split(',')):
        if t in cols and c not in cols[t]:
            fails.append(f'INSERT: kolumna {t}.{c} nie jest tworzona')

for m in re.finditer(r'SELECT ([\w, ]+?) FROM (\w+)', src):
    t = m.group(2)
    for c in (x.strip() for x in m.group(1).split(',')):
        if t in cols and c and c != '*' and not c.isdigit() and not c.upper().startswith('DISTINCT') and c not in cols[t]:
            fails.append(f'SELECT: kolumna {t}.{c} nie jest tworzona')

for f in sorted(set(fails)):
    print('BLAD', f)
print(f'{len(cols)} tabel, {sum(len(v) for v in cols.values())} kolumn sprawdzonych')
if fails:
    sys.exit(1)
print('WSZYSTKO OK')
