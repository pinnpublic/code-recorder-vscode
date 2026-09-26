const pkg=require('../package.json');
const errors=[];
if(pkg.publisher==='code-recorder-local') errors.push('실제 Marketplace 게시자 ID를 package.json의 publisher에 지정하세요.');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`게시 대상: ${pkg.publisher}.${pkg.name} ${pkg.version} (실제 계정 권한은 Marketplace에서 확인)`);
