"""Generate the three original national flags; preserve the vendored UN SVG."""

from math import atan2, cos, pi, sin
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def star(x, y, radius, angle=-pi / 2):
    points = []
    for i in range(10):
        r = radius if i % 2 == 0 else radius * sin(pi / 10) / sin(3 * pi / 10)
        a = angle + i * pi / 5
        points.append(f"{x + r * cos(a):.3f},{y + r * sin(a):.3f}")
    return '<polygon points="' + ' '.join(points) + '"/>'


def write(name, title, body, description=""):
    (ROOT / name).write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" '
        'width="900" height="600" role="img" aria-labelledby="title desc">\n'
        f'  <title id="title">{title}</title>\n'
        f'  <desc id="desc">{description or title}</desc>\n'
        + body + '\n</svg>\n', encoding='utf-8'
    )


def main():
    body = '<rect width="900" height="600" fill="#fff"/>\n'
    body += '<g fill="#b22234">\n'
    for row in range(0, 13, 2):
        body += f'<rect y="{row * 600 / 13:.3f}" width="900" height="{600 / 13:.3f}"/>\n'
    body += '</g>\n<rect width="360" height="323.077" fill="#3c3b6e"/>\n<g fill="#fff">\n'
    for row in range(9):
        for col in range(6 if row % 2 == 0 else 5):
            body += star(30 + col * 60 + (30 if row % 2 else 0), (row + 1) * 323.077 / 10, 14) + '\n'
    write('united-states.svg', 'United States flag', body + '</g>')

    body = '<rect width="900" height="600" fill="#ee1c25"/>\n<g fill="#ffde00">\n'
    body += star(150, 150, 90) + '\n'
    for x, y in [(300, 60), (360, 120), (360, 210), (300, 270)]:
        body += star(x, y, 30, atan2(150 - y, 150 - x)) + '\n'
    write('china.svg', 'China flag', body + '</g>')

    body = '<rect width="900" height="600" fill="#cc0000"/>\n'
    body += '<g fill="none" stroke="#ffd700" stroke-width="5">' + star(190, 76, 32) + '</g>\n'
    body += '''<g fill="#ffd700">
<path d="M139 137 L163 112 L209 156 L194 172 L173 151 L126 217 L115 205 L157 138 Z"/>
<path d="M209 108 C272 147 264 213 218 233 C187 247 158 235 140 219 L117 244 L105 232 L130 207 L142 194 C164 224 205 232 229 207 C256 178 241 133 209 108 Z"/>
</g>'''
    write('soviet-union.svg', 'Soviet Union flag', body,
          'Red flag with a gold outlined star and stylized hammer and sickle; shared Soviet/Russian data marker.')

    # united-nations.svg is vendored artwork; see README.md for its source.


if __name__ == '__main__':
    main()
