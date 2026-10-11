import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseClarityResponse,AI_MODEL} from '../../src/lib/agent/import-core.mjs';
test('accepts real Workers AI structured-object and string response formats',()=>{
 const result={reviews:[{id:'123',clear:true,reason:'explicit subject and deadline'}]};
 assert.deepEqual(parseClarityResponse({response:result}),result);
 assert.deepEqual(parseClarityResponse({response:JSON.stringify(result)}),result);
 assert.deepEqual(parseClarityResponse({choices:[{message:{content:'```json\n'+JSON.stringify(result)+'\n```'}}]}),result);
 assert(AI_MODEL.includes('70b'));
});
test('refusals or missing outputs fail closed, not interpreted as source approval',()=>{
 assert.throws(()=>parseClarityResponse({response:'I cannot answer the question'}));assert.throws(()=>parseClarityResponse({}));
});
