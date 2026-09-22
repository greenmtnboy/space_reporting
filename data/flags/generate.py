"""Generate the project's self-contained flag illustrations using only the stdlib."""

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

    body = '<rect width="900" height="600" fill="#009edb"/>\n'
    body += '<g fill="none" stroke="#fff" stroke-width="3">\n'
    for r in (42, 84, 126, 168):
        body += f'<circle cx="450" cy="275" r="{r}"/>\n'
    for i in range(12):
        a = i * pi / 6
        body += f'<path d="M450 275 L{450 + 168 * cos(a):.3f} {275 + 168 * sin(a):.3f}"/>\n'
    body += '''</g>
<g fill="#fff">
<!-- Original, simplified polar silhouettes of the continents. -->
<path d="M421 191 L399 175 L368 182 L348 208 L330 214 L317 249 L336 272 L354 272 L365 292 L389 305 L400 327 L416 332 L410 302 L389 278 L390 250 L414 236 L432 219 Z"/>
<path d="M410 154 L436 140 L451 152 L445 184 L428 199 L417 179 Z"/>
<path d="M402 330 L428 338 L443 362 L438 386 L425 411 L414 428 L405 404 L403 380 L393 359 Z"/>
<path d="M462 211 L481 194 L482 173 L506 163 L533 178 L542 202 L570 211 L598 236 L610 262 L590 279 L580 307 L559 307 L540 280 L521 286 L511 266 L487 259 L472 240 L454 234 Z"/>
<path d="M469 263 L499 274 L514 302 L506 329 L488 356 L476 343 L470 317 L453 300 L451 278 Z"/>
<path d="M549 335 L570 326 L592 342 L586 369 L561 375 L543 358 Z"/>
<path d="M528 303 L545 311 L556 331 L546 337 L535 321 Z"/>
</g>
<g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round">
<path d="M464 492 C328 492 227 374 257 244"/>
<path d="M436 492 C572 492 673 374 643 244"/>
</g>
<g fill="#fff">
'''
    for mirrored in (False, True):
        body += '<g' + (' transform="translate(900 0) scale(-1 1)"' if mirrored else '') + '>\n'
        for x, y, angle in [(256, 278, -15), (259, 316, -30), (271, 354, -45), (292, 391, -60), (322, 425, -75), (359, 454, -90), (401, 476, -105)]:
            body += f'<ellipse cx="{x - 13}" cy="{y - 12}" rx="10" ry="29" transform="rotate({angle} {x - 13} {y - 12})"/>\n'
            body += f'<ellipse cx="{x + 15}" cy="{y - 18}" rx="9" ry="26" transform="rotate({angle + 65} {x + 15} {y - 18})"/>\n'
        body += '</g>\n'
    write('united-nations.svg', 'United Nations flag illustration', body + '</g>',
          'White polar world map and olive branches on UN blue. Simplified original illustration for the fallback data marker, not an official emblem reproduction.')


if __name__ == '__main__':
    main()
