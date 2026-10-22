"""Build the standalone demo from maintained source files and bundled geography."""

import json
from pathlib import Path

from seed import DEFAULT_CONFIG, seed_projects

ROOT = Path(__file__).parent
PUBLIC = ROOT / 'public'
SCRIPTS = (
    'vendor/topojson.min.js',
    'vendor/pdf-lib.min.js',
    'vendor/material-symbols.js',
    'export-engine.js',
    'app.js',
)


def script_text(value):
    return value.replace('</script', '<\\/script')


def build():
    # Browser-safe alias: some content blockers intercept the ISO filename GTM.
    (PUBLIC / 'data/guatemala-regions.json').write_text(
        (PUBLIC / 'data/GTM.json').read_text(encoding='utf-8'), encoding='utf-8'
    )
    geography = {
        str(path.relative_to(PUBLIC)): json.loads(path.read_text(encoding='utf-8'))
        for path in sorted((PUBLIC / 'data').glob('*.json'))
        if path.name != 'world-raw.json'
    }
    seed = {'projects': seed_projects(), 'config': DEFAULT_CONFIG}
    for project in seed['projects']:
        project['access'] = 'admin'
    html = (PUBLIC / 'index.html').read_text(encoding='utf-8')
    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        '<style>' + (PUBLIC / 'styles.css').read_text(encoding='utf-8') + '</style>',
    )
    bootstrap = (
        'window.STANDALONE=true;window.SEED=' + script_text(json.dumps(seed))
        + ';window.EMBEDDED='
        + script_text(json.dumps(geography, separators=(',', ':'))) + ';'
    )
    html = html.replace(
        '<script src="vendor/d3.min.js"></script>',
        '<script>' + bootstrap + '</script><script>'
        + script_text((PUBLIC / 'vendor/d3.min.js').read_text(encoding='utf-8'))
        + '</script>',
    )
    for name in SCRIPTS:
        html = html.replace(
            '<script src="' + name + '"></script>',
            '<script>' + script_text((PUBLIC / name).read_text(encoding='utf-8'))
            + '</script>',
        )
    (ROOT / 'Property-Map.html').write_text(html, encoding='utf-8')
    print(f'Built self-contained Property-Map.html: {len(html.encode()) / 1024**2:.2f} MiB')


if __name__ == '__main__':
    build()
