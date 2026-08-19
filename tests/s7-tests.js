const ok=T.ok;
const cell=t=>({text:t,confidence:0.9,ocr:true});
const row=(type,qty,part,flags)=>Object.assign({
  PartNumber:cell(part||''),Type:type||'',"Matched Childpart":part||'',
  Quantity:cell(qty||''),Description:cell('d'),Material:cell('m')}, flags||{});
const dupMsg = () => (validateRequiredFields().missingFields||[]).find(m=>/Duplicate/.test(m)) || '';

T.head('existing validation is unchanged');
spreadsheetData=[row('Child Part','2','D-1')];
ok('a good row passes', validateRequiredFields().isValid===true);
spreadsheetData=[row('','2','D-1')];
ok('missing Type still blocks', validateRequiredFields().isValid===false);
spreadsheetData=[row('Child Part','','D-1')];
ok('missing Quantity still blocks', validateRequiredFields().isValid===false);
spreadsheetData=[row('Child Part','2','')];
ok('missing Part Number still blocks', validateRequiredFields().isValid===false);
spreadsheetData=[row('Child Part','abc','D-1')];
ok('non-numeric Quantity still blocks', validateRequiredFields().isValid===false);
spreadsheetData=[row('Child Part','2','D-1',{_missingDrawing:true})];
ok('_missingDrawing still blocks', validateRequiredFields().isValid===false);
spreadsheetData=[];
ok('empty table is not submittable', validateRequiredFields().isValid===false);

T.head('duplicate child parts are blocked');
spreadsheetData=[row('Child Part','1','D-100'),row('Child Part','2','D-100')];
ok('two identical child parts blocked', validateRequiredFields().isValid===false);
ok('message names the part', /D-100/.test(dupMsg()));
spreadsheetData=[row('Child Part','1','D-100'),row('Child Part','2','D-200')];
ok('different parts pass', validateRequiredFields().isValid===true);

T.head('normalisation matches what submit actually sends');
spreadsheetData=[row('Child Part','1','D.1.0'),row('Child Part','2','D10')];
ok('same drawing after dot-stripping is a duplicate', validateRequiredFields().isValid===false);

T.head('scope: only rows that reach the Child Parts table');
spreadsheetData=[row('BO','1','X-1'),row('BO','2','X-1')];
ok('duplicate BO rows are NOT blocked', validateRequiredFields().isValid===true);
spreadsheetData=[row('Child Part','1','D-1'),row('BO','2','D-1')];
ok('child part vs BO with same text is NOT blocked', validateRequiredFields().isValid===true);
spreadsheetData=[row('Missing Drawing','1','M-1'),row('Missing Drawing','2','M-1')];
ok('duplicate Missing Drawing rows blocked', validateRequiredFields().isValid===false);
spreadsheetData=[row('Child Part','1','D-1'),row('Missing Drawing','2','D-1')];
ok('child part and missing drawing collide', validateRequiredFields().isValid===false);

T.head('no false positives');
spreadsheetData=[row('Child Part','1','D-1'),row('Child Part','','D-1')];
ok('incomplete duplicate row not counted', /Duplicate/.test(dupMsg())===false);
spreadsheetData=[row('Child Part','1','D-1'),row('','','')];
ok('blank rows ignored', validateRequiredFields().isValid===true);
spreadsheetData=[row('Child Part','1','D-1'),row('Child Part','2','')];
ok('empty part number reported as missing, not duplicate', /Duplicate/.test(dupMsg())===false);
spreadsheetData=[row('Child Part','1','D-1'),row('Child Part','2','D-2'),row('Child Part','3','D-1')];
ok('non-adjacent duplicate caught', validateRequiredFields().isValid===false);
spreadsheetData=[row('Child Part','1','D-1'),row('Child Part','2','D-1'),row('Child Part','3','D-1')];
ok('three of the same reported once', (dupMsg().match(/D-1/g)||[]).length===1);
T.done();
