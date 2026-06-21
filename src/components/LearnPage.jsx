import React, { useState, useEffect, useRef, useMemo } from 'react';
import './LearnPage.css';

import pieceNlt from '../assets/chess/cburnett/Chess_nlt45.svg';
import pieceNdt from '../assets/chess/cburnett/Chess_ndt45.svg';
import pieceBlt from '../assets/chess/cburnett/Chess_blt45.svg';
import pieceBdt from '../assets/chess/cburnett/Chess_bdt45.svg';
import pieceRlt from '../assets/chess/cburnett/Chess_rlt45.svg';
import pieceRdt from '../assets/chess/cburnett/Chess_rdt45.svg';
import pieceQlt from '../assets/chess/cburnett/Chess_qlt45.svg';
import pieceQdt from '../assets/chess/cburnett/Chess_qdt45.svg';
import pieceKlt from '../assets/chess/cburnett/Chess_klt45.svg';
import pieceKdt from '../assets/chess/cburnett/Chess_kdt45.svg';
import piecePlt from '../assets/chess/cburnett/Chess_plt45.svg';
import piecePdt from '../assets/chess/cburnett/Chess_pdt45.svg';

const PIECE_SRC = {
  N: pieceNlt, n: pieceNdt,
  B: pieceBlt, b: pieceBdt,
  R: pieceRlt, r: pieceRdt,
  Q: pieceQlt, q: pieceQdt,
  K: pieceKlt, k: pieceKdt,
  P: piecePlt, p: piecePdt,
};

const PIECE_NAME = {
  N: 'White knight', n: 'Black knight',
  B: 'White bishop', b: 'Black bishop',
  R: 'White rook',   r: 'Black rook',
  Q: 'White queen',  q: 'Black queen',
  K: 'White king',   k: 'Black king',
  P: 'White pawn',   p: 'Black pawn',
};

/* ---------- Board ---------- */
function Board({ size = 8, cellSize = 56, cells = {}, showCoords = false, arrows = [], className = '' }) {
  const totalSize = size * cellSize;
  const cellEls = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = `${r},${c}`;
      const cell = cells[key] || {};
      const isLight = (r + c) % 2 === 0;
      const hls = (cell.hl || []).map((h, i) => (
        <div key={i} className={`cb-hl cb-hl--${h}`} />
      ));
      let marker = null;
      if (cell.marker === 'dot') marker = <div className="cb-marker" />;
      else if (cell.marker === 'capture') marker = <div className="cb-marker cb-marker--capture" />;
      else if (cell.marker === 'x') marker = <div className="cb-marker cb-marker--x">✕</div>;
      const coord = showCoords ? (
        <span className="cb-coord">
          {c === 0 ? String(size - r) : ''}
          {r === size - 1 ? String.fromCharCode(97 + c) : ''}
        </span>
      ) : null;
      cellEls.push(
        <div
          key={key}
          className={`cb-cell ${isLight ? 'light' : 'dark'}`}
          style={{ width: cellSize, height: cellSize }}
        >
          {hls}
          {marker}
          {coord}
          {cell.piece && (
            <div className="cb-piece" aria-label={PIECE_NAME[cell.piece] || cell.piece}>
              <img src={PIECE_SRC[cell.piece]} alt="" draggable="false" />
            </div>
          )}
        </div>,
      );
    }
  }
  return (
    <div
      className={`cb-board ${className}`}
      style={{ gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, width: totalSize }}
    >
      {cellEls}
      {arrows.length > 0 && (
        <svg
          className="cb-arrow-layer"
          width={totalSize}
          height={totalSize}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
          viewBox={`0 0 ${totalSize} ${totalSize}`}
        >
          <defs>
            <marker id="lp-ah" markerWidth="6" markerHeight="6" refX="3.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="rgba(125,196,53,0.95)" />
            </marker>
          </defs>
          {arrows.map((a, i) => {
            const x1 = a.from[1] * cellSize + cellSize / 2;
            const y1 = a.from[0] * cellSize + cellSize / 2;
            const x2 = a.to[1] * cellSize + cellSize / 2;
            const y2 = a.to[0] * cellSize + cellSize / 2;
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={a.color || 'rgba(125,196,53,0.85)'}
                strokeWidth={Math.max(4, cellSize * 0.08)}
                strokeLinecap="round"
                markerEnd="url(#lp-ah)"
                style={{ filter: 'drop-shadow(0 0 6px rgba(125,196,53,0.4))' }}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ---------- Hero aura diagram ---------- */
function HeroAuraDiagram() {
  const SIZE = 7;
  const KR = 3, KC = 3;
  const cells = useMemo(() => {
    const c = {};
    c[`${KR},${KC}`] = { piece: 'N', hl: ['source'] };
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const r = KR + dr, kc = KC + dc;
      if (r >= 0 && r < SIZE && kc >= 0 && kc < SIZE) c[`${r},${kc}`] = { hl: ['adj'] };
    }
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const r = KR + dr, kc = KC + dc;
      if (r >= 0 && r < SIZE && kc >= 0 && kc < SIZE) c[`${r},${kc}`] = { hl: ['knm'] };
    }
    return c;
  }, []);
  return <Board size={SIZE} cellSize={56} cells={cells} />;
}

/* ---------- Scenario data ---------- */
const SCENARIOS = [
  {
    id: 'aura-source',
    label: 'Aura Source',
    tabNum: '01',
    headline: 'A knight projects aura onto every friendly piece around it.',
    intro: 'Friendly knights are the only source. Step through to see what counts as "around it".',
    boardSize: 5,
    cellSize: 64,
    steps: [
      {
        title: 'A lone knight',
        desc: 'Just a white knight on the board, no aura yet.',
        build: () => ({ '2,2': { piece: 'N' } }),
      },
      {
        title: 'Aura covers 8 touching squares',
        desc: 'Every square next to the knight — orthogonal and diagonal — is covered.',
        build: () => {
          const cells = { '2,2': { piece: 'N', hl: ['source'] } };
          for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            cells[`${2+dr},${2+dc}`] = { hl: ['adj'] };
          }
          return cells;
        },
      },
      {
        title: 'Aura also covers knight-move squares',
        desc: 'Plus the 8 squares your knight could legally jump to. Same color knight only.',
        build: () => {
          const cells = { '2,2': { piece: 'N', hl: ['source'] } };
          for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            cells[`${2+dr},${2+dc}`] = { hl: ['adj'] };
          }
          for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            const r = 2+dr, c = 2+dc;
            if (r >= 0 && r < 5 && c >= 0 && c < 5) cells[`${r},${c}`] = { hl: ['knm'] };
          }
          return cells;
        },
      },
      {
        title: 'Friendly pieces in the aura become empowered',
        desc: 'Any white piece on a green square gains the one-jump ability. The knight itself does not.',
        build: () => {
          const cells = { '2,2': { piece: 'N', hl: ['source'] } };
          for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            cells[`${2+dr},${2+dc}`] = { hl: ['adj'] };
          }
          for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            const r = 2+dr, c = 2+dc;
            if (r >= 0 && r < 5 && c >= 0 && c < 5) cells[`${r},${c}`] = { hl: ['knm'] };
          }
          cells['1,2'] = { piece: 'R', hl: ['adj'] };
          cells['2,3'] = { piece: 'B', hl: ['adj'] };
          cells['3,1'] = { piece: 'P', hl: ['adj'] };
          cells['0,1'] = { piece: 'Q', hl: ['knm'] };
          return cells;
        },
      },
    ],
  },
  {
    id: 'legal-jump',
    label: 'Legal Jump',
    tabNum: '02',
    headline: 'An empowered slider keeps its line — but skips one blocker.',
    intro: 'A rook on rank 4 normally stops at the pawn. Empowered, it jumps over and keeps going.',
    boardSize: 8,
    cellSize: 50,
    steps: [
      {
        title: 'Rook is empowered by the knight',
        desc: 'The knight at d3 puts the rook at b4 inside the aura. The rook gains one jump.',
        build: () => {
          const cells = {};
          cells['5,3'] = { piece: 'N', hl: ['source'] };
          cells['4,1'] = { piece: 'R', hl: ['adj'] };
          cells['4,3'] = { piece: 'p' };
          cells['4,5'] = { piece: 'b' };
          return cells;
        },
      },
      {
        title: 'Without aura, the line stops at the blocker',
        desc: 'Normally a rook can move only to c4. The pawn on d4 is a wall.',
        build: () => {
          const cells = {};
          cells['5,3'] = { piece: 'N', hl: ['source'] };
          cells['4,1'] = { piece: 'R' };
          cells['4,2'] = { hl: ['adj'], marker: 'dot' };
          cells['4,3'] = { piece: 'p', hl: ['blocker-mark'] };
          cells['4,4'] = { hl: ['blocker-mark'], marker: 'x' };
          cells['4,5'] = { piece: 'b', hl: ['blocker-mark'] };
          return cells;
        },
      },
      {
        title: 'With aura, the rook clears the pawn',
        desc: 'It still moves on its line, but skips one blocker. e4, f4 (capture) become reachable.',
        build: () => {
          const cells = {};
          cells['5,3'] = { piece: 'N', hl: ['source'] };
          cells['4,1'] = { piece: 'R', hl: ['adj'] };
          cells['4,2'] = { marker: 'dot' };
          cells['4,3'] = { piece: 'p' };
          cells['4,4'] = { marker: 'dot' };
          cells['4,5'] = { piece: 'b', hl: ['legal'], marker: 'capture' };
          return cells;
        },
        arrows: [{ from: [4,1], to: [4,5] }],
      },
      {
        title: 'The blocker stays on the board',
        desc: 'After the jump, the pawn is unmoved. Only the rook lands on the target — capturing it.',
        build: () => {
          const cells = {};
          cells['5,3'] = { piece: 'N', hl: ['source'] };
          cells['4,5'] = { piece: 'R', hl: ['legal'] };
          cells['4,3'] = { piece: 'p' };
          return cells;
        },
      },
    ],
  },
  {
    id: 'one-jump',
    label: 'One-Jump Limit',
    tabNum: '03',
    headline: 'Aura grants exactly one jump per move — never two.',
    intro: 'After clearing the first blocker, the next occupied square is a hard stop.',
    boardSize: 8,
    cellSize: 50,
    steps: [
      {
        title: 'Empowered queen, two blockers ahead',
        desc: 'Queen on a4, knight powering her, pawns on c4 and e4, enemy rook on g4.',
        build: () => {
          const cells = {};
          cells['5,2'] = { piece: 'N', hl: ['source'] };
          cells['4,0'] = { piece: 'Q', hl: ['adj'] };
          cells['4,2'] = { piece: 'P' };
          cells['4,4'] = { piece: 'p' };
          cells['4,6'] = { piece: 'r' };
          return cells;
        },
      },
      {
        title: 'Queen jumps the first blocker',
        desc: 'b4 and d4 are reachable. The c4 pawn is jumped over, no capture.',
        build: () => {
          const cells = {};
          cells['5,2'] = { piece: 'N', hl: ['source'] };
          cells['4,0'] = { piece: 'Q', hl: ['adj'] };
          cells['4,1'] = { marker: 'dot' };
          cells['4,2'] = { piece: 'P' };
          cells['4,3'] = { marker: 'dot' };
          cells['4,4'] = { piece: 'p', hl: ['blocker-mark'] };
          cells['4,5'] = { hl: ['blocker-mark'], marker: 'x' };
          cells['4,6'] = { piece: 'r', hl: ['blocker-mark'] };
          return cells;
        },
        arrows: [{ from: [4,0], to: [4,3] }],
      },
      {
        title: 'But the line stops at blocker #2',
        desc: 'The enemy pawn on e4 is the second blocker. f4, g4 are unreachable this turn.',
        build: () => {
          const cells = {};
          cells['5,2'] = { piece: 'N', hl: ['source'] };
          cells['4,0'] = { piece: 'Q', hl: ['adj'] };
          cells['4,1'] = { marker: 'dot' };
          cells['4,2'] = { piece: 'P' };
          cells['4,3'] = { marker: 'dot' };
          cells['4,4'] = { piece: 'p', hl: ['illegal'] };
          cells['4,5'] = { hl: ['illegal'], marker: 'x' };
          cells['4,6'] = { piece: 'r', hl: ['illegal'] };
          return cells;
        },
      },
    ],
  },
  {
    id: 'pawn-rules',
    label: 'Pawn Rules',
    tabNum: '04',
    headline: 'Pawns can jump too — but capture direction never changes.',
    intro: 'Forward jumps need an empty landing square. Diagonal jumps can capture.',
    boardSize: 5,
    cellSize: 64,
    steps: [
      {
        title: 'Forward jump · empty landing',
        desc: 'Empowered pawn on c1. Blocker on c2, c3 is empty → legal.',
        build: () => {
          const cells = {};
          cells['4,1'] = { piece: 'N', hl: ['source'] };
          cells['4,2'] = { piece: 'P', hl: ['adj'] };
          cells['3,2'] = { piece: 'p' };
          cells['2,2'] = { hl: ['legal'], marker: 'dot' };
          return cells;
        },
        arrows: [{ from: [4,2], to: [2,2] }],
      },
      {
        title: 'Forward jump onto a piece · ILLEGAL',
        desc: 'Pawns never capture straight forward — even when jumping. The rook on c3 is safe.',
        build: () => {
          const cells = {};
          cells['4,1'] = { piece: 'N', hl: ['source'] };
          cells['4,2'] = { piece: 'P', hl: ['adj'] };
          cells['3,2'] = { piece: 'p' };
          cells['2,2'] = { piece: 'r', hl: ['illegal'] };
          return cells;
        },
      },
      {
        title: 'Diagonal jump capture · LEGAL',
        desc: 'Pawn captures diagonally as usual. Aura lets it skip the bishop and take the rook.',
        build: () => {
          const cells = {};
          cells['4,1'] = { piece: 'N', hl: ['source'] };
          cells['4,2'] = { piece: 'P', hl: ['adj'] };
          cells['3,1'] = { piece: 'b' };
          cells['2,0'] = { piece: 'r', hl: ['legal'], marker: 'capture' };
          return cells;
        },
        arrows: [{ from: [4,2], to: [2,0] }],
      },
    ],
  },
];

/* ---------- Puzzle data ---------- */
const PUZZLES = [
  {
    id: 'p1',
    tag: 'Aura check',
    q: 'Is the queen empowered?',
    hint: 'A friendly knight at a3. The queen on d3. Touch test: count the squares between.',
    boardSize: 5,
    cellSize: 50,
    build: () => {
      const cells = {};
      cells['2,0'] = { piece: 'N' };
      cells['2,3'] = { piece: 'Q' };
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const r = 2+dr, c = 0+dc;
        if (r >= 0 && r < 5 && c >= 0 && c < 5) {
          if (!cells[`${r},${c}`]) cells[`${r},${c}`] = { hl: ['adj'] };
          else cells[`${r},${c}`].hl = ['adj'];
        }
      }
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const r = 2+dr, c = 0+dc;
        if (r >= 0 && r < 5 && c >= 0 && c < 5) {
          if (!cells[`${r},${c}`]) cells[`${r},${c}`] = { hl: ['knm'] };
        }
      }
      return cells;
    },
    choices: [
      { label: 'Yes, empowered', value: 'yes' },
      { label: 'No, out of aura', value: 'no' },
    ],
    answer: 'no',
    explain: {
      ok: 'Right. The queen at d3 is more than two squares from the knight, outside both the touching ring and the knight-move ring.',
      no: 'Look again. The aura covers 16 squares max. The queen at d3 is too far — three columns over.',
    },
  },
  {
    id: 'p2',
    tag: 'Legal jump',
    q: 'Can the rook capture the bishop?',
    hint: 'Empowered rook on a4, your pawn on c4, enemy bishop on d4.',
    boardSize: 5,
    cellSize: 50,
    build: () => {
      const cells = {};
      cells['3,0'] = { piece: 'N', hl: ['source'] };
      cells['2,0'] = { piece: 'R', hl: ['adj'] };
      cells['2,2'] = { piece: 'P' };
      cells['2,3'] = { piece: 'b' };
      return cells;
    },
    choices: [
      { label: 'Legal — capture', value: 'yes' },
      { label: 'Blocked', value: 'no' },
    ],
    answer: 'yes',
    explain: {
      ok: 'Right. The rook clears your pawn (one jump) and lands on the bishop on d4 — capture.',
      no: 'Look again. Only one piece is between the rook and the bishop. Aura grants exactly one jump — that is enough.',
    },
  },
  {
    id: 'p3',
    tag: 'Pawn rule',
    q: 'How many legal aura moves does the pawn have?',
    hint: 'White pawn on b2, knight on a3 empowers it. Enemy pawn on b3 (forward blocker), bishop on c3 (diagonal blocker), rook on d4.',
    boardSize: 5,
    cellSize: 50,
    build: () => {
      const cells = {};
      cells['2,0'] = { piece: 'N', hl: ['source'] };
      cells['3,1'] = { piece: 'P', hl: ['adj'] };
      cells['2,1'] = { piece: 'p' };
      cells['2,2'] = { piece: 'b' };
      cells['1,3'] = { piece: 'r' };
      return cells;
    },
    choices: [
      { label: 'One — diagonal only', value: 'one' },
      { label: 'Two — forward and diagonal', value: 'two' },
    ],
    answer: 'two',
    explain: {
      ok: 'Right. Forward jump clears the pawn on b3 and lands on empty b4 — legal. Diagonal jump clears the bishop on c3 and captures the rook on d4 — also legal. Two moves.',
      no: 'Look again. b4 is empty, so the forward jump is legal (pawns can jump forward into empty squares). The diagonal capture over c3 to d4 also works. Both are legal.',
    },
  },
];

/* ---------- Scenario Player ---------- */
function ScenarioPlayer() {
  const [tabIdx, setTabIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef(null);

  const scenario = SCENARIOS[tabIdx];
  const step = scenario.steps[stepIdx];
  const cells = useMemo(() => step.build(), [step]);

  useEffect(() => { setStepIdx(0); setPlaying(false); }, [tabIdx]);

  useEffect(() => {
    if (!playing) {
      if (playTimer.current) clearTimeout(playTimer.current);
      return;
    }
    if (stepIdx >= scenario.steps.length - 1) {
      setPlaying(false);
      return;
    }
    playTimer.current = setTimeout(() => {
      setStepIdx((i) => Math.min(i + 1, scenario.steps.length - 1));
    }, 1700);
    return () => clearTimeout(playTimer.current);
  }, [playing, stepIdx, scenario.steps.length]);

  const next = () => setStepIdx((i) => Math.min(i + 1, scenario.steps.length - 1));
  const prev = () => setStepIdx((i) => Math.max(i - 1, 0));

  return (
    <div className="lp-scenario">
      <div className="lp-scenario-stage">
        <div className="lp-tabbar" role="tablist" aria-label="Rule chapters">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === tabIdx}
              className={`lp-tab ${i === tabIdx ? 'active' : ''}`}
              onClick={() => setTabIdx(i)}
            >
              <span className="lp-tab-num">{s.tabNum}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="lp-scenario-board-wrap">
          <Board
            key={`${scenario.id}-${stepIdx}`}
            size={scenario.boardSize}
            cellSize={scenario.cellSize}
            cells={cells}
            arrows={step.arrows || []}
            showCoords
            className="lp-fade-in"
          />
        </div>
        <div className="lp-scrubber">
          <button className="lp-scrub-btn" onClick={prev} disabled={stepIdx === 0} aria-label="Previous step">‹</button>
          <button
            className={`lp-scrub-play ${playing ? 'on' : ''}`}
            onClick={() => {
              if (stepIdx >= scenario.steps.length - 1) setStepIdx(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? '❚❚ Pause' : '▶ Play scenario'}
          </button>
          <button className="lp-scrub-btn" onClick={next} disabled={stepIdx >= scenario.steps.length - 1} aria-label="Next step">›</button>
          <span className="lp-scrub-counter">{stepIdx + 1}/{scenario.steps.length}</span>
        </div>
        <div className="lp-scrub-progress">
          <div className="lp-scrub-progress-fill" style={{ width: `${(stepIdx + 1) / scenario.steps.length * 100}%` }} />
        </div>
      </div>

      <div className="lp-scenario-side">
        <div className="lp-scenario-title">
          <span className="lp-pill">Chapter {scenario.tabNum}</span>
          <span>{scenario.label}</span>
        </div>
        <h3 className="lp-scenario-h">{scenario.headline}</h3>
        <p className="lp-scenario-intro">{scenario.intro}</p>
        <div className="lp-steps">
          {scenario.steps.map((s, i) => (
            <div
              key={i}
              className={`lp-step ${i === stepIdx ? 'active' : ''}`}
              onClick={() => { setStepIdx(i); setPlaying(false); }}
            >
              <div className="lp-step-num">{i === stepIdx ? '●' : i + 1}</div>
              <div className="lp-step-body">
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Puzzle Card ---------- */
function PuzzleCard({ puzzle }) {
  const [picked, setPicked] = useState(null);
  const correct = picked && picked === puzzle.answer;
  const wrong = picked && picked !== puzzle.answer;
  const cells = useMemo(() => puzzle.build(), [puzzle]);

  return (
    <div className={`lp-puzzle ${correct ? 'solved' : ''} ${wrong ? 'wrong' : ''}`}>
      <span className="lp-puzzle-tag">{puzzle.tag}</span>
      <div className="lp-puzzle-q">{puzzle.q}</div>
      <div className="lp-puzzle-hint">{puzzle.hint}</div>
      <div className="lp-puzzle-board-wrap">
        <Board size={puzzle.boardSize} cellSize={puzzle.cellSize} cells={cells} />
      </div>
      <div className="lp-puzzle-choices">
        {puzzle.choices.map((c) => {
          let cls = 'lp-choice';
          if (picked === c.value) cls += correct ? ' correct' : ' incorrect';
          else if (picked && c.value === puzzle.answer) cls += ' correct';
          if (picked) cls += ' disabled';
          return (
            <button key={c.value} className={cls} onClick={() => setPicked(c.value)}>
              {c.label}
            </button>
          );
        })}
      </div>
      {picked && (
        <div className={`lp-puzzle-feedback ${wrong ? 'bad' : ''}`}>
          <strong>{correct ? '✓' : '✕'}</strong>
          {correct ? puzzle.explain.ok : puzzle.explain.no}
        </div>
      )}
    </div>
  );
}

/* ---------- LearnPage ---------- */
export default function LearnPage({ onBack, onOpenCommunityPuzzles }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'knightAuraChess — Learn';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="lp-page">
      <header className="lp-header">
        <button className="lp-back-btn" onClick={onBack}>← Back to Game</button>
        <span className="lp-crumb">Knight-Aura&nbsp;<strong>Learn</strong></span>
        <span className="lp-spacer" />
        <nav className="lp-toc">
          <a className="lp-toc-link active" href="#twist">The Twist</a>
          <a className="lp-toc-link" href="#scenarios">Scenarios</a>
          <a className="lp-toc-link" href="#practice">Practice</a>
          <a className="lp-toc-link" href="#glossary">Glossary</a>
        </nav>
      </header>

      <section className="lp-hero" id="twist">
        <div className="lp-hero-eyebrow">A chess variant in one rule</div>
        <h1>
          Friendly knights cast an <em>aura</em>.<br />
          Pieces inside it can <em>jump one blocker</em>.
        </h1>
        <p className="lp-hero-lede">
          Standard chess movement applies, with one twist: any of your pieces standing next to or a
          knight-move away from a friendly knight can <strong>clear exactly one piece</strong> on its normal line.
        </p>
        <div className="lp-diorama">
          <div className="lp-aura-board-wrap">
            <HeroAuraDiagram />
          </div>
          <div className="lp-diorama-copy">
            <h3>The aura, at a glance</h3>
            <p>
              A knight projects its aura over <strong>16 squares</strong>: the 8 it touches and the 8 it
              could legally jump to. Friendly pieces sitting on those squares are empowered.
            </p>
            <div className="lp-legend-list">
              <div className="lp-legend-row">
                <span className="lp-legend-swatch lp-legend-swatch--source" />
                <span><strong>Source</strong> the white knight (own knights only)</span>
              </div>
              <div className="lp-legend-row">
                <span className="lp-legend-swatch lp-legend-swatch--adj" />
                <span><strong>Touching ring</strong> 8 adjacent squares</span>
              </div>
              <div className="lp-legend-row">
                <span className="lp-legend-swatch lp-legend-swatch--knm" />
                <span><strong>Knight-move ring</strong> 8 jump squares</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section" id="scenarios">
        <div className="lp-section-head">
          <span className="lp-section-num">02 / SCENARIOS</span>
          <h2>How a move actually plays out</h2>
          <span className="lp-section-sub">Step through, or hit play.</span>
        </div>
        <ScenarioPlayer />
      </section>

      <section className="lp-section" id="practice">
        <div className="lp-section-head">
          <span className="lp-section-num">03 / PRACTICE</span>
          <h2>Three quick checks</h2>
          <span className="lp-section-sub">Pick the right answer to feel the rule.</span>
        </div>
        <div className="lp-practice-grid">
          {PUZZLES.map((p) => <PuzzleCard key={p.id} puzzle={p} />)}
        </div>
      </section>

      <section className="lp-section" id="glossary">
        <div className="lp-section-head">
          <span className="lp-section-num">04 / GLOSSARY</span>
          <h2>Four terms you&apos;ll hear</h2>
        </div>
        <div className="lp-glossary">
          <div className="lp-gloss">
            <div className="lp-gloss-mark">A</div>
            <div>
              <h4>Aura</h4>
              <p>The 16-square zone around a friendly knight where pieces gain the one-jump ability.</p>
            </div>
          </div>
          <div className="lp-gloss">
            <div className="lp-gloss-mark">E</div>
            <div>
              <h4>Empowered</h4>
              <p>A piece sitting in the aura. It moves normally — but may skip a single blocker on its line.</p>
            </div>
          </div>
          <div className="lp-gloss">
            <div className="lp-gloss-mark">B</div>
            <div>
              <h4>Blocker</h4>
              <p>Any piece, friend or foe, sitting on the empowered piece&apos;s movement path. Stays put when jumped.</p>
            </div>
          </div>
          <div className="lp-gloss">
            <div className="lp-gloss-mark">L</div>
            <div>
              <h4>Hard limit</h4>
              <p>One jump per move. A second blocker stops the line. King jumps must still leave the king safe.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-outro">
        <div className="lp-outro-text">
          Ready to try? <strong>Knight aura is the only rule change</strong> — everything else is chess.
        </div>
        <div className="lp-outro-actions">
          <button className="lp-btn-ghost" onClick={onBack}>← Back</button>
          <button className="lp-btn-ghost" onClick={onOpenCommunityPuzzles}>Community puzzles</button>
          <button className="lp-btn-primary" onClick={onBack}>Start a game →</button>
        </div>
      </footer>
    </div>
  );
}
