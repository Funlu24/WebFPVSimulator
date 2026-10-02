/*
 * manoeuvres.js: the figures a racing line is made of.
 *
 * A track is pieces and the order they are flown in, and the line between them is derived (path.js).
 * What a pilot is asked to do between two pieces, a hairpin, a split-S, a power loop, is a shape
 * of that line and nothing the document has a word for. This file is those shapes, as pure
 * geometry: no document, no DOM, no Three.js. flightpaths.js lays them into a document as ordinary
 * waypoints, so the board, the game and the line already know them and nothing about the stored
 * track changes.
 *
 * THE LIST IS THE OWNER'S, from the catalogue of 2026-10-02 (part 1, Manoeuvres): straight, hop,
 * turn, climbing turn, descending turn, split-S, reverse split-S, power loop, corkscrew, dive,
 * launch, slalom, figure 8 and matty flip. Every turn has a handedness and, where it is
 * relevant, a vertical sense.
 *
 * A CURVE IS LOCAL. It starts at the origin heading along +u, level, and is described in the
 * frame a pilot flying it would use: u ahead, v to the left, w up. placeCurve puts it in the
 * world, from where it starts (a figure after a pass), where it ends (a figure into one) or from
 * its middle (a hop over something). A left turn is anticlockwise seen from above, so v is
 * positive on its inside, and a right turn is the mirror.
 *
 * EVERY POINT CARRIES ITS TANGENT. The line is a Hermite curve through its knots, and a knot
 * with the wrong direction is a kink, so each point says which way the line is going through it,
 * in all three axes, and a vertical loop is followed because its waypoints point up and over.
 * (path.js reads a waypoint's pitch for this; a waypoint with none points level, as it always
 * did.) Points are at most 45 degrees apart round a curve, which is the spacing at which the
 * Hermite reproduces a circle to within about a percent.
 *
 * SIZES. A figure is drawn at the size of the track it is on: a field's turn is three metres in
 * radius and a whoop's is under half a metre, and the author nudges it Tight or Wide.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

const RAD = Math.PI / 180;
const TAU = 2 * Math.PI;

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

/*
 * The manoeuvres, as the owner's catalogue lists them. `also` is what else a pilot calls it, which
 * the card's tooltip says so that a pilot who knows it by another name finds it. The rest says
 * which choices it has: `hand` left or right, `degs` how far round, `sense` up or down, `count`
 * how many weaves, `bias` which way an exit leans.
 */
export const MANOEUVRES = [
  {
    id: 'straight',
    label: 'Straight',
    also: [],
    bias: true,
    heading: 'none',
    height: 'none',
    hint: 'Straight on. The exit can lean left, right, up or down to set up the next element.',
  },
  {
    id: 'hop',
    label: 'Hop',
    also: ['pop-over'],
    sense: true,
    heading: 'none',
    height: 'up and back down',
    hint: 'Up and back down on the same heading: over a hurdle, a gate or a crossover. Down and back up is a dip, under something.',
  },
  {
    id: 'turn',
    label: 'Turn',
    also: ['hairpin (180)', 'orbit (360)'],
    hand: true,
    degs: [90, 180, 360],
    heading: '90, 180 or 360 degrees',
    height: 'none',
    hint: 'A flat turn, left or right: a quarter, a hairpin or a full orbit.',
  },
  {
    id: 'climb',
    label: 'Climbing turn',
    also: ['spiral up', 'orbit up'],
    hand: true,
    degs: [90, 180, 360],
    heading: '90, 180 or 360 degrees',
    height: 'gain',
    hint: 'A turn that climbs as it goes round. The radius is limited by anything overhead.',
  },
  {
    id: 'descend',
    label: 'Descending turn',
    also: ['spiral down', 'orbit down'],
    hand: true,
    degs: [90, 180, 360],
    heading: '90, 180 or 360 degrees',
    height: 'loss',
    hint: 'A turn that loses height as it goes round. It needs the height to spend.',
  },
  {
    id: 'splitS',
    label: 'Split-S',
    also: ['S-turn'],
    heading: '180 degrees',
    height: 'loss',
    hint: 'Half roll to inverted and pull through: the heading reverses and the line ends below where it began.',
  },
  {
    id: 'revSplitS',
    label: 'Reverse Split-S',
    also: ['half power loop'],
    heading: '180 degrees',
    height: 'gain',
    hint: 'Pull up and over and roll out upright: the heading reverses and the line ends above where it began.',
  },
  {
    id: 'loop',
    label: 'Power loop',
    also: ['loop'],
    heading: 'none (a vertical 360)',
    height: 'returns to the entry height',
    hint: 'A vertical circle: up, over, down and out the way it went in, at the height it started.',
  },
  {
    id: 'corkscrew',
    label: 'Corkscrew',
    also: ['sideways power loop'],
    hand: true,
    sense: true,
    heading: 'none, with a lateral offset',
    height: 'returns',
    hint: 'A sideways loop that keeps the next gate in view: a roll round the line of flight, left or right, going up or down first.',
  },
  {
    id: 'dive',
    label: 'Dive',
    also: [],
    heading: 'any',
    height: 'large loss',
    hint: 'Nose down onto a steep line and pull out level, a long way lower.',
  },
  {
    id: 'launch',
    label: 'Launch',
    also: ['punch-out'],
    heading: 'any',
    height: 'large gain',
    hint: 'A steep climb out and over to level, a long way higher.',
  },
  {
    id: 'slalom',
    label: 'Slalom',
    also: ['weave'],
    hand: true,
    count: [3, 4, 5, 6],
    heading: 'alternating left and right',
    height: 'none',
    hint: 'A weave: alternately left and right of the line, as many times as you ask for.',
  },
  {
    id: 'fig8',
    label: 'Figure 8',
    also: ['Dutch 8'],
    hand: true,
    heading: 'two opposing 360s',
    height: 'none',
    hint: 'Two opposite orbits joined where the line began: left then right, or right then left.',
  },
  {
    id: 'matty',
    label: 'Matty flip',
    also: ['back swing'],
    heading: '180 degrees',
    height: 'up and over',
    hint: 'Up and over onto the reverse heading and down the far side. A freestyle figure, rare as a required line.',
  },
];

export function manoeuvreById(id) {
  return MANOEUVRES.find((m) => m.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Sizes                                                               */
/* ------------------------------------------------------------------ */

export const SIZE_IDS = ['tight', 'standard', 'wide'];
export const SIZE_FACTOR = { tight: 0.6, standard: 1, wide: 1.6 };

/*
 * THE NUMBERS A FIGURE IS DRAWN WITH, per class of track, in metres. `radius` is the radius of a turn
 * and of a loop; `lead` is the straight a figure starts with so the line leaves a piece straight;
 * `hop` and `hopLength` the height and length of a hop; `bias` how far and how hard an exit leans;
 * `weave` and `swing` the spacing and sideways reach of a slalom; `advance` how far a corkscrew
 * goes forward in a turn of its roll; `drop` how far a dive or a launch goes.
 *
 * A field's radius is three metres, which is inside the 2.5 m a freeform line is held to and
 * outside what the plan's own spirals are (the Drone Nationals plan sets its limit to a metre). A
 * whoop's is 0.45 m, the limit a whoop track is held to.
 */
export const FIGURE_BASE = {
  full: {
    radius: 3, lead: 1.5, hop: 1.8, hopLength: 10, biasDistance: 4, bias: 1.5, weave: 8, swing: 1.4, advance: 20, drop: 5,
  },
  micro: {
    radius: 0.45, lead: 0.25, hop: 0.45, hopLength: 1.8, biasDistance: 0.8, bias: 0.3, weave: 1.1, swing: 0.3, advance: 3, drop: 1.2,
  },
};

export function baseFor(cls) {
  return cls === 'micro' ? FIGURE_BASE.micro : FIGURE_BASE.full;
}

/* ------------------------------------------------------------------ */
/* A figure's own words                                                */
/* ------------------------------------------------------------------ */

/*
 * A SPEC is what a figure is, in the owner's words: { id, hand, deg, sense, size, count, bias,
 * again }. Everything is optional and filled from the manoeuvre's own defaults by specOf, so a spec
 * written by hand, or read back from a name, is always whole.
 *
 *   hand    'left' or 'right'
 *   deg     90, 180 or 360 where a turn has one
 *   sense   'up' or 'down'
 *   size    'tight', 'standard' or 'wide'
 *   count   how many weaves
 *   bias    which way a straight's exit leans: 'none', 'left', 'right', 'up' or 'down'
 *   again   'back through' or 'back through reversed': the piece the figure belongs to is flown a
 *           second time when it is done, the same way or the other (flightpaths.js)
 *   radius  a radius in metres that overrides the size, for a turn that has to go round something
 *   rise    metres of height a turn gains or loses, overriding its default
 *   lead    metres of straight to start with, overriding the default
 */
export function specOf(raw = {}) {
  const def = manoeuvreById(raw.id) ?? MANOEUVRES[0];
  const spec = { id: def.id };
  if (def.hand) {
    spec.hand = raw.hand === 'right' ? 'right' : 'left';
  }
  if (def.degs) {
    spec.deg = def.degs.includes(Number(raw.deg)) ? Number(raw.deg) : (def.id === 'turn' || def.id === 'climb' || def.id === 'descend' ? 180 : def.degs[0]);
  }
  if (def.sense) {
    spec.sense = raw.sense === 'down' ? 'down' : 'up';
  }
  if (def.count) {
    spec.count = def.count.includes(Number(raw.count)) ? Number(raw.count) : 4;
  }
  if (def.bias) {
    spec.bias = ['left', 'right', 'up', 'down'].includes(raw.bias) ? raw.bias : 'none';
  }
  if (def.id !== 'straight') {
    spec.size = SIZE_IDS.includes(raw.size) ? raw.size : 'standard';
  }
  if (raw.again === 'back through' || raw.again === 'back through reversed') {
    spec.again = raw.again;
  }
  for (const key of ['radius', 'rise', 'lead']) {
    if (Number.isFinite(raw[key]) && raw[key] >= 0) {
      spec[key] = raw[key];
    }
  }
  return spec;
}

/* The words a figure's waypoints are named by, which is how it is found again. */
const NAMED = [
  ['Descending turn', 'descend'],
  ['Climbing turn', 'climb'],
  ['Reverse Split-S', 'revSplitS'],
  ['Split-S', 'splitS'],
  ['Power loop', 'loop'],
  ['Corkscrew', 'corkscrew'],
  ['Figure 8', 'fig8'],
  ['Matty flip', 'matty'],
  ['Slalom', 'slalom'],
  ['Straight', 'straight'],
  ['Launch', 'launch'],
  ['Turn', 'turn'],
  ['Dive', 'dive'],
  ['Dip', 'hop'],
  ['Hop', 'hop'],
];

/*
 * "Turn left 180", "Climbing turn right 360, wide", "Corkscrew left up", "Slalom right x4", "Exit
 * left", "Hop", "Dip", "Power loop, back through". Plain words, because it is what the lap strip
 * and a warning call the point, and complete, because it is how a figure is read back off a
 * document that came from the board, which keeps names and drops anything else.
 */
export function figureName(raw) {
  const spec = specOf(raw);
  const def = manoeuvreById(spec.id);
  let name = def.label;
  if (spec.id === 'hop') {
    name = spec.sense === 'down' ? 'Dip' : 'Hop';
  } else if (spec.id === 'straight') {
    name = spec.bias && spec.bias !== 'none' ? `Exit ${spec.bias}` : 'Straight';
  }
  if (spec.hand) {
    name += ` ${spec.hand}`;
  }
  if (spec.deg) {
    name += ` ${spec.deg}`;
  }
  if (spec.id === 'corkscrew') {
    name += ` ${spec.sense}`;
  }
  /* A hop's sense is in its name already, a Hop and a Dip. */
  if (spec.count) {
    name += ` x${spec.count}`;
  }
  if (spec.size && spec.size !== 'standard') {
    name += `, ${spec.size}`;
  }
  if (spec.again) {
    name += `, ${spec.again}`;
  }
  return name;
}

/* The spec a name says, or null when it is not a figure's name. Exact: figureName of the answer is the name. */
export function parseFigureName(name) {
  const text = String(name ?? '');
  const again = /, back through reversed$/.test(text) ? 'back through reversed' : (/, back through$/.test(text) ? 'back through' : '');
  const body = again ? text.slice(0, text.length - again.length - 2) : text;
  const sizeAt = /, (tight|wide)$/.exec(body);
  const size = sizeAt ? sizeAt[1] : 'standard';
  const bare = sizeAt ? body.slice(0, body.length - sizeAt[0].length) : body;
  const exit = /^Exit (left|right|up|down)$/.exec(bare);
  if (exit) {
    return specOf({ id: 'straight', bias: exit[1], again });
  }
  for (const [label, id] of NAMED) {
    if (bare !== label && !bare.startsWith(`${label} `)) {
      continue;
    }
    const rest = bare.slice(label.length).trim().split(/\s+/).filter(Boolean);
    const raw = { id, size, again };
    if (label === 'Dip') {
      raw.sense = 'down';
    }
    for (const token of rest) {
      if (token === 'left' || token === 'right') {
        raw.hand = token;
      } else if (token === 'up' || token === 'down') {
        raw.sense = token;
      } else if (/^x\d+$/.test(token)) {
        raw.count = Number(token.slice(1));
      } else if (/^\d+$/.test(token)) {
        raw.deg = Number(token);
      } else {
        return null;
      }
    }
    const spec = specOf(raw);
    return figureName(spec) === text ? spec : null;
  }
  return null;
}

export function isFigureName(name) {
  return parseFigureName(name) !== null;
}

/*
 * THE TWO POINTS' NAMES A LAUNCH GATE IS LAID WITH, the pull up before it and the push over after, which are quarter
 * circles of a figure's size and are as tight as one: they are not manoeuvres a card offers, so they are not in the closed
 * grammar above, but the line round them is exempt from the tight corner warning the same way.
 */
export function isLaunchName(name) {
  return name === 'Pull up' || name === 'Push over';
}

/* ------------------------------------------------------------------ */
/* The curves                                                          */
/* ------------------------------------------------------------------ */

/* A point of a curve: where it is and which way the line goes through it, in the local frame. */
function pt(u, v, w, tu, tv, tw) {
  const m = Math.hypot(tu, tv, tw) || 1;
  return { u, v, w, tu: tu / m, tv: tv / m, tw: tw / m };
}

/* Steps of at most 45 degrees round `sweep` radians. */
function steps(sweep) {
  return Math.max(1, Math.ceil(Math.abs(sweep) / (45 * RAD) - 1e-9));
}

/*
 * A level or helical turn: `deg` degrees of heading change round a centre `radius` to the left (`h` 1) or
 * the right (`h` -1) of where it starts, gaining `rise` metres on the way, after `lead` metres of straight.
 */
function turnPoints(h, deg, radius, rise, lead) {
  const out = [];
  if (lead > 0) {
    out.push(pt(lead, 0, 0, 1, 0, 0));
  }
  const sweep = deg * RAD;
  const n = steps(sweep);
  const slope = rise / (radius * sweep);
  for (let k = 1; k <= n; k += 1) {
    const phi = (sweep * k) / n;
    out.push(pt(
      lead + radius * Math.sin(phi),
      h * radius * (1 - Math.cos(phi)),
      rise * (k / n),
      Math.cos(phi),
      h * Math.sin(phi),
      slope,
    ));
  }
  return out;
}

/*
 * A vertical arc in the plane of the heading: `sweep` radians of loop, up (`dir` 1) or down (`dir` -1),
 * after `lead` metres of straight. At the top of a loop the heading has reversed, so a tangent is
 * given as it is, forward component and all, and the conversion to a heading and a pitch is placeCurve's.
 */
function loopPoints(dir, sweep, radius, lead, from = 0) {
  const out = [];
  if (lead > 0) {
    out.push(pt(lead, 0, 0, 1, 0, 0));
  }
  const n = steps(sweep);
  for (let k = 1; k <= n; k += 1) {
    const phi = from + (sweep * k) / n;
    out.push(pt(
      lead + radius * Math.sin(phi),
      0,
      dir * radius * (1 - Math.cos(phi)),
      Math.cos(phi),
      0,
      dir * Math.sin(phi),
    ));
  }
  return out;
}

/*
 * A steep line out of level flight and back to level: a nose-over arc to 55 degrees, straight along it, and a longer
 * pull-out, `dir` -1 for a dive and 1 for a launch, a total of `drop` metres lower or higher, after `lead` metres
 * of straight.
 */
function climbOutPoints(dir, drop, radius, lead) {
  const a = 55 * RAD;
  const rin = radius;
  const rout = radius * 1.4;
  const inU = rin * Math.sin(a);
  const inW = rin * (1 - Math.cos(a));
  const outW = rout * (1 - Math.cos(a));
  const run = Math.max(0, Math.abs(drop) - inW - outW) / Math.sin(a);
  const out = [];
  if (lead > 0) {
    out.push(pt(lead, 0, 0, 1, 0, 0));
  }
  out.push(pt(lead + inU, 0, dir * inW, Math.cos(a), 0, dir * Math.sin(a)));
  const u2 = lead + inU + run * Math.cos(a);
  const w2 = dir * (inW + run * Math.sin(a));
  out.push(pt(u2, 0, w2, Math.cos(a), 0, dir * Math.sin(a)));
  /* The pull out, from the steep line to level: the heading eases from a to a half to nothing. */
  out.push(pt(
    u2 + rout * (Math.sin(a) - Math.sin(a / 2)),
    0,
    w2 + dir * rout * (Math.cos(a / 2) - Math.cos(a)),
    Math.cos(a / 2),
    0,
    dir * Math.sin(a / 2),
  ));
  out.push(pt(u2 + rout * Math.sin(a), 0, w2 + dir * outW, 1, 0, 0));
  return out;
}

/*
 * The curve of a spec on a class of track: { points, end, lead }. `points` are in the order they are
 * flown, not counting where the figure starts; `end` is the last of them, which is where the line
 * leaves; `lead` is the straight it starts with.
 */
export function curveOf(raw, cls = 'full') {
  const spec = specOf(raw);
  const base = baseFor(cls);
  const f = SIZE_FACTOR[spec.size ?? 'standard'];
  const h = spec.hand === 'right' ? -1 : 1;
  const radius = spec.radius ?? base.radius * f;
  /*
   * THE STRAIGHT A FIGURE STARTS WITH. A full circle (an orbit, a loop, a figure 8) is centred a radius ahead of where
   * it begins, so it reaches that far back, and a lead shorter than the radius would put it through the piece it
   * came from; a matty flip swings back as far again. They start clear of it. A half turn or a half loop reaches
   * only forward and keeps the short lead.
   */
  const circles = ((spec.id === 'turn' || spec.id === 'climb' || spec.id === 'descend') && spec.deg === 360)
    || spec.id === 'loop' || spec.id === 'fig8';
  const clear = spec.id === 'matty' ? radius * 3 : (circles ? radius + 0.8 : 0);
  const lead = spec.lead ?? Math.max(base.lead * (spec.size === 'tight' ? 0.7 : 1), clear);
  let points = [];

  switch (spec.id) {
    case 'straight': {
      const d = base.biasDistance;
      const off = base.bias;
      const lean = Math.atan2(off, d);
      if (spec.bias === 'left' || spec.bias === 'right') {
        const s = spec.bias === 'left' ? 1 : -1;
        points = [pt(d, s * off, 0, Math.cos(lean * 0.6), s * Math.sin(lean * 0.6), 0)];
      } else if (spec.bias === 'up' || spec.bias === 'down') {
        const s = spec.bias === 'up' ? 1 : -1;
        points = [pt(d, 0, s * off, Math.cos(lean * 0.6), 0, s * Math.sin(lean * 0.6))];
      } else {
        points = [pt(d, 0, 0, 1, 0, 0)];
      }
      break;
    }
    case 'hop': {
      const height = base.hop * (spec.sense === 'down' ? -1 : 1) * Math.max(0.6, f);
      const length = base.hopLength * Math.max(0.75, f);
      const slopeAt = (x) => Math.atan(height * Math.PI / length * Math.sin(2 * Math.PI * x / length));
      points = [0.25, 0.5, 0.75, 1].map((q) => {
        const x = q * length;
        const z = height * Math.sin(Math.PI * x / length) ** 2;
        const a = slopeAt(x);
        return pt(x, 0, z, Math.cos(a), 0, Math.sin(a));
      });
      break;
    }
    case 'turn':
      points = turnPoints(h, spec.deg, radius, 0, lead);
      break;
    case 'climb':
      points = turnPoints(h, spec.deg, radius, spec.rise ?? 0.6 * radius * (spec.deg / 180), lead);
      break;
    case 'descend':
      points = turnPoints(h, spec.deg, radius, -(spec.rise ?? 0.6 * radius * (spec.deg / 180)), lead);
      break;
    case 'splitS':
      points = loopPoints(-1, Math.PI, radius, lead);
      break;
    case 'revSplitS':
      points = loopPoints(1, Math.PI, radius, lead);
      break;
    case 'loop':
      points = loopPoints(1, TAU, radius, lead);
      break;
    case 'matty': {
      /* Up and over, then down the far side: a reverse split-S, and from the top of it a dive as deep as it is high,
       * on the reverse heading, so the line ends level at the height it began, facing back. */
      const r1 = radius * 0.8;
      points = loopPoints(1, Math.PI, r1, lead);
      const top = points[points.length - 1];
      for (const p of climbOutPoints(-1, top.w, radius, 0)) {
        points.push(pt(top.u - p.u, -p.v, top.w + p.w, -p.tu, -p.tv, p.tw));
      }
      break;
    }
    case 'corkscrew': {
      /* A roll round a line parallel to the heading, a radius to the left or the right of it: a barrel roll's radius,
       * half a turn's, so the line in and out of it is not a tight bend. */
      const adv = base.advance * f;
      const rc = radius * 0.4;
      const sigma = spec.sense === 'down' ? h : -h;
      const theta0 = h > 0 ? Math.PI : 0;
      const n = 8;
      if (lead > 0) {
        points.push(pt(lead, 0, 0, 1, 0, 0));
      }
      for (let k = 1; k <= n; k += 1) {
        const t = (TAU * k) / n;
        const theta = theta0 + sigma * t;
        points.push(pt(
          lead + (adv * k) / n,
          h * rc + rc * Math.cos(theta),
          rc * Math.sin(theta),
          adv / TAU,
          -sigma * rc * Math.sin(theta),
          sigma * rc * Math.cos(theta),
        ));
      }
      /* Out of the roll and level: a roll's last point still points sideways and up, and the next piece is ahead. */
      points.push(pt(lead + adv + 1.6 * rc, 0, 0, 1, 0, 0));
      break;
    }
    case 'dive':
    case 'launch': {
      const drop = spec.rise ?? base.drop * f;
      points = climbOutPoints(spec.id === 'dive' ? -1 : 1, drop, radius, lead);
      break;
    }
    case 'slalom': {
      const spacing = base.weave * f;
      const swing = base.swing * f;
      if (lead > 0) {
        points.push(pt(lead, 0, 0, 1, 0, 0));
      }
      for (let k = 1; k <= spec.count; k += 1) {
        const side = (k % 2 === 1 ? 1 : -1) * h;
        points.push(pt(lead + spacing * (k - 0.5), side * swing, 0, 1, 0, 0));
      }
      points.push(pt(lead + spacing * spec.count, 0, 0, 1, 0, 0));
      break;
    }
    case 'fig8': {
      if (lead > 0) {
        points.push(pt(lead, 0, 0, 1, 0, 0));
      }
      for (const lobe of [h, -h]) {
        const full = turnPoints(lobe, 360, radius, 0, 0);
        for (const p of full) {
          points.push({ ...p, u: p.u + lead });
        }
      }
      break;
    }
    default:
      points = [];
  }
  return { spec, points, end: points[points.length - 1] ?? null, lead: points.length && points[0].u === lead ? lead : 0 };
}

/* ------------------------------------------------------------------ */
/* Into the world                                                      */
/* ------------------------------------------------------------------ */

/* A tangent as a heading and a pitch: the heading is where it points on the ground, and straight up or down keeps the one it had. */
function headingOf(tx, ty, tz, keep) {
  const flat = Math.hypot(tx, ty);
  return {
    yaw: flat > 1e-6 ? Math.atan2(ty, tx) : keep,
    pitch: Math.atan2(tz, flat),
  };
}

/*
 * THE POINTS OF A CURVE IN THE WORLD, as { x, y, z, yaw, pitch }.
 *
 * `pose` is { x, y, z, yaw }: where the figure is laid and which way the pilot is going there. `at` says what
 * the pose is: 'start' (the figure begins there, which is a figure after a pass), 'end' (the figure ends
 * there, which is a figure into one) or 'middle' (the middle of the curve is there, which is a hop over
 * something). Only the heading's turning is used, never a tilt: a figure is flown in the plane of the
 * ground and the vertical plane through the heading.
 */
export function placeCurve(curve, pose, at = 'start') {
  const pts = curve.points;
  if (!pts.length) {
    return [];
  }
  const pivot = at === 'end'
    ? pts[pts.length - 1]
    : (at === 'middle' ? pts[Math.floor((pts.length - 1) / 2)] : { u: 0, v: 0, w: 0, tu: 1, tv: 0, tw: 0 });
  const local = headingOf(pivot.tu, pivot.tv, pivot.tw, 0);
  const yaw0 = pose.yaw - (at === 'start' ? 0 : local.yaw);
  const c = Math.cos(yaw0);
  const s = Math.sin(yaw0);
  const origin = {
    x: pose.x - (c * pivot.u - s * pivot.v),
    y: pose.y - (s * pivot.u + c * pivot.v),
    z: pose.z - pivot.w,
  };
  let keep = yaw0;
  return pts.map((p) => {
    const tx = c * p.tu - s * p.tv;
    const ty = s * p.tu + c * p.tv;
    const h = headingOf(tx, ty, p.tw, keep);
    keep = h.yaw;
    return {
      x: origin.x + c * p.u - s * p.v,
      y: origin.y + s * p.u + c * p.v,
      z: origin.z + p.w,
      yaw: h.yaw,
      pitch: h.pitch,
    };
  });
}

/* The net of a curve, in its own frame: how far on, to the left and up it ends, and how far its heading has turned. */
export function netOf(curve) {
  const e = curve.end;
  if (!e) {
    return { u: 0, v: 0, w: 0, turn: 0 };
  }
  return { u: e.u, v: e.v, w: e.w, turn: headingOf(e.tu, e.tv, e.tw, 0).yaw };
}
