import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

function loadJson(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
  const text = fs.readFileSync(abs, 'utf8');
  return JSON.parse(text);
}

function getAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // Load referenced schemas
  const changesetSchema = loadJson('schemas/agent-changeset.schema.json');
  const escalationSchema = loadJson('schemas/agent-escalation.schema.json');
  ajv.addSchema(changesetSchema, 'schemas/agent-changeset.schema.json');
  ajv.addSchema(escalationSchema, 'schemas/agent-escalation.schema.json');

  return ajv;
}

export function validateAgentOutputObject(obj) {
  const ajv = getAjv();
  const schema = loadJson('schemas/agent-output.schema.json');
  const validate = ajv.compile(schema);
  const ok = validate(obj);
  return { ok, errors: ok ? [] : validate.errors || [] };
}

export function validateAgentOutputFile(filePath) {
  const obj = loadJson(filePath);
  return validateAgentOutputObject(obj);
}

export function writeValidationReport(errors, outDir = 'reports/validation') {
  const outPath = path.join(projectRoot, outDir, 'agent-output-violations.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = errors.map((e) => ({
    instancePath: e.instancePath,
    message: e.message,
    params: e.params,
    schemaPath: e.schemaPath,
  }));
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return outPath;
}
