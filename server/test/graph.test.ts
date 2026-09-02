import { describe, expect, it } from 'vitest';
import { validateGraph } from '../src/core/graph.js';
import { branchingGraph, edge, linearGraph, node } from './helpers.js';

describe('validateGraph', () => {
  it('accepts scenario 1 and the branching graph', () => {
    expect(validateGraph(linearGraph())).toEqual([]);
    expect(validateGraph(branchingGraph())).toEqual([]);
  });

  it('rejects incompatible port types (text → image)', () => {
    const errors = validateGraph({
      nodes: [node('p1', 'prompt', { text: 'x' }), node('r1', 'result', {})],
      edges: [edge('p1', 'text', 'r1', 'image')],
    });
    expect(errors.some((e) => e.includes('incompatible port types'))).toBe(true);
  });

  it('rejects an unconnected required input', () => {
    const errors = validateGraph({
      nodes: [node('g1', 'generate', { presetId: null })],
      edges: [],
    });
    expect(errors.some((e) => e.includes('required input "prompt" is not connected'))).toBe(true);
  });

  it('rejects a cycle', () => {
    const errors = validateGraph({
      nodes: [node('e1', 'edit', { prompt: 'a' }), node('e2', 'edit', { prompt: 'b' })],
      edges: [edge('e1', 'image', 'e2', 'image'), edge('e2', 'image', 'e1', 'image')],
    });
    expect(errors).toContain('Graph contains a cycle');
  });

  it('rejects edges referencing missing nodes and ports', () => {
    const errors = validateGraph({
      nodes: [node('p1', 'prompt', { text: 'x' }), node('g1', 'generate', { presetId: null })],
      edges: [
        edge('ghost', 'text', 'g1', 'prompt'),
        edge('p1', 'nope', 'g1', 'prompt'),
      ],
    });
    expect(errors.some((e) => e.includes('missing source node "ghost"'))).toBe(true);
    expect(errors.some((e) => e.includes('has no output port "nope"'))).toBe(true);
  });

  it('rejects two connections into one input port', () => {
    const errors = validateGraph({
      nodes: [
        node('p1', 'prompt', { text: 'a' }),
        node('p2', 'prompt', { text: 'b' }),
        node('g1', 'generate', { presetId: null }),
      ],
      edges: [edge('p1', 'text', 'g1', 'prompt'), edge('p2', 'text', 'g1', 'prompt')],
    });
    expect(errors.some((e) => e.includes('multiple connections'))).toBe(true);
  });

  it('rejects an empty graph', () => {
    expect(validateGraph({ nodes: [], edges: [] })).toContain('Graph has no nodes');
  });

  it('rejects malformed nodes instead of crashing (untrusted JSON)', () => {
    const errors = validateGraph({ nodes: [null], edges: [] } as never);
    expect(errors.some((e) => e.includes('must be an object with an id'))).toBe(true);
  });

  it('rejects prototype-polluting and malformed ids', () => {
    const protoErrors = validateGraph({
      nodes: [node('__proto__', 'prompt', { text: 'x' })],
      edges: [],
    });
    expect(protoErrors.some((e) => e.includes('must be an object with an id'))).toBe(true);

    const spacedErrors = validateGraph({
      nodes: [node('has spaces!', 'prompt', { text: 'x' })],
      edges: [],
    });
    expect(spacedErrors.some((e) => e.includes('must be an object with an id'))).toBe(true);
  });

  it('rejects prototype keys as node kinds instead of crashing', () => {
    for (const kind of ['toString', 'constructor', '__proto__']) {
      const errors = validateGraph({
        nodes: [{ id: 'x1', kind, data: {} }],
        edges: [],
      } as never);
      expect(errors.some((e) => e.includes('unknown kind'))).toBe(true);
    }
  });

  it('rejects an oversized or malformed image data URL', () => {
    const oversized = validateGraph({
      nodes: [node('i1', 'image-input', { imageDataUrl: `data:image/png;base64,${'A'.repeat(14 * 1024 * 1024)}` })],
      edges: [],
    });
    expect(oversized.some((e) => e.includes('exceeds the 10 MB upload limit'))).toBe(true);

    const notDataUrl = validateGraph({
      nodes: [node('i1', 'image-input', { imageDataUrl: 'https://evil.example/x.png' })],
      edges: [],
    });
    expect(notDataUrl.some((e) => e.includes('must be a data URL'))).toBe(true);
  });

  it('rejects overlong text payloads', () => {
    const errors = validateGraph({
      nodes: [node('p1', 'prompt', { text: 'a'.repeat(2001) })],
      edges: [],
    });
    expect(errors.some((e) => e.includes('exceeds 2000 characters'))).toBe(true);
  });
});
