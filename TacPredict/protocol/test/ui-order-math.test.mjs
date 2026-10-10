import assert from 'node:assert/strict';
import {usdcAtomic,limitQuote,signedOrderSchema} from '../../src/lib/protocol/orders.ts';
assert.equal(usdcAtomic('123456789012345678.123456'),123456789012345678123456n);
for(const value of ['0','-1','1e6','0.0000001','NaN','Infinity'])assert.throws(()=>usdcAtomic(value));
const quote=limitQuote('25','0.62');assert(quote.maximumCostAtomic<=quote.budgetAtomic);assert.equal(quote.sharesAtomic,40322580n);assert.throws(()=>limitQuote('25','1'));assert.throws(()=>signedOrderSchema.parse({}));
console.log('PASS UI exact atomic order math: six decimals, large integers, budget ceiling, invalid values rejected');
