#!/usr/bin/env python3
"""Corre las suites SQL de supabase/tests contra el proyecto enlazado.

Cada suite se ejecuta dentro de una transacción que se revierte (no deja
rastro). Con --with se ensaya una migración todavía NO aplicada: su SQL se
inserta al inicio de la transacción de cada suite, así que las pruebas ven
la base "como quedaría" y todo se revierte al final.

  python3 supabase/tests/run.py                       # todas las suites
  python3 supabase/tests/run.py profile               # solo las que contengan "profile"
  python3 supabase/tests/run.py --with supabase/migrations/2026…_x.sql
  python3 supabase/tests/run.py consumer --psql "docker exec -i supabase_db_<proyecto> psql -U postgres"   # base local
"""
import argparse
import shlex
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent


def run_suite(path: Path, prelude: str, psql: str | None) -> tuple[int, int, list[dict]]:
    sql = path.read_text(encoding='utf-8')
    if prelude:
        if '\nbegin;\n' not in sql:
            raise SystemExit(f'{path.name}: no encontré "begin;" para insertar la migración')
        sql = sql.replace('\nbegin;\n', '\nbegin;\n' + prelude + '\n', 1)
    if psql:
        return run_suite_psql(path, sql, psql)
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as tmp:
        tmp.write(sql)
    proc = subprocess.run(['supabase', 'db', 'query', '--linked', '-f', tmp.name, '-o', 'json'], capture_output=True, text=True)
    Path(tmp.name).unlink(missing_ok=True)
    out = proc.stdout
    start = min((i for i in (out.find('['), out.find('{')) if i >= 0), default=-1)
    if proc.returncode != 0 or start < 0:
        print(f'  ✗ {path.name}: error al ejecutar\n{proc.stderr[-2000:] or out[-2000:]}')
        return 0, 1, []
    data = json.loads(out[start:])
    rows = data if isinstance(data, list) else data.get('rows', [])
    failed = [r for r in rows if r.get('result') != 'PASS']
    return len(rows) - len(failed), len(rows), failed


def run_suite_psql(path: Path, sql: str, psql: str) -> tuple[int, int, list[dict]]:
    """Same suite through a psql command (e.g. the local database): the last select's rows are read as tab-separated text."""
    proc = subprocess.run([*shlex.split(psql), '-X', '-q', '-A', '-t', '-F', '\t', '-v', 'ON_ERROR_STOP=1'], input=sql, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f'  ✗ {path.name}: error al ejecutar\n{proc.stderr[-2000:]}')
        return 0, 1, []
    cols = ['area', 'test', 'expected', 'got', 'detail', 'result']
    rows = [dict(zip(cols, line.split('\t'))) for line in proc.stdout.splitlines() if line.count('\t') == 5 and line.endswith(('\tPASS', '\tFAIL'))]
    failed = [r for r in rows if r['result'] != 'PASS']
    return len(rows) - len(failed), len(rows), failed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('filter', nargs='?', default='')
    parser.add_argument('--with', dest='with_migrations', action='append', default=[], help='migración a ensayar (se puede repetir)')
    parser.add_argument('--psql', help='comando psql para correr en otra base (p. ej. la local); sin esto, el proyecto enlazado')
    args = parser.parse_args()

    prelude = '\n'.join(Path(m).read_text(encoding='utf-8') for m in args.with_migrations)
    suites = sorted(p for p in HERE.glob('*.sql') if args.filter in p.stem)
    total_ok = total = 0
    for suite in suites:
        ok, count, failed = run_suite(suite, prelude, args.psql)
        total_ok += ok
        total += count
        print(f'  {"✓" if ok == count else "✗"} {suite.stem}: {ok}/{count}')
        for row in failed:
            print(f'      FAIL [{row.get("area")}] {row.get("test")}: esperado {row.get("expected")!r}, obtenido {row.get("got")!r} {row.get("detail") or ""}')
    print(f'Total: {total_ok}/{total}')
    sys.exit(0 if total_ok == total and total > 0 else 1)


if __name__ == '__main__':
    main()
