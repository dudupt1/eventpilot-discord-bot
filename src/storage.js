import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.resolve(directory, '../data.json');

function emptyData() {
  return { events: {} };
}

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return { ...emptyData(), ...parsed, events: parsed?.events ?? {} };
  } catch (error) {
    if (error.code === 'ENOENT') {
      const initial = emptyData();
      fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2));
      return initial;
    }
    throw new Error(`Could not load data.json: ${error.message}`);
  }
}

function write(data) {
  const temporary = `${dataFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
  fs.renameSync(temporary, dataFile);
}

export function snapshot() {
  return structuredClone(read());
}

/** Persists an event mutation as one atomic file replacement. */
export function mutate(change) {
  const data = read();
  const result = change(data);
  write(data);
  return result;
}
