import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

const SCHEMA_DIR = path.join(process.cwd(), 'mcp', 'capability-schemas');

let ajvInstance = null;
function getAjv() {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ allErrors: true, strict: false });
  }
  return ajvInstance;
}

function capToSchemaFile(capability, kind = 'input') {
  const file = `${capability}.${kind}.schema.json`;
  return path.join(SCHEMA_DIR, file);
}

export function validateCapabilityParams(capability, params, kind = 'input') {
  try {
    const schemaPath = capToSchemaFile(capability, kind);
    if (!fs.existsSync(schemaPath)) {
      return { ok: true, reason: 'no_schema' };
    }
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = getAjv();
    const validate = ajv.compile(schema);
    const valid = validate(params || {});
    if (valid) return { ok: true };
    const errors = (validate.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`);
    return { ok: false, errors };
  } catch (e) {
    return { ok: false, errors: [`validator_error: ${e.message}`] };
  }
}


