const fs=require('node:fs'),path=require('node:path');
const {runTests}=require('@vscode/test-electron');
delete process.env.ELECTRON_RUN_AS_NODE;
const root=path.resolve(__dirname,'..'),build=path.join(root,'build','integration');
fs.mkdirSync(build,{recursive:true});
const workspace=path.join(build,'workspace-'+Date.now());fs.mkdirSync(workspace,{recursive:true});
const settings=path.join(build,'user-data','User');fs.mkdirSync(settings,{recursive:true});
const installed=process.env.CODE_RECORDER_INSTALLED_TEST==='1';
const probe=path.join(build,'probe');
if(installed){fs.mkdirSync(probe,{recursive:true});fs.writeFileSync(path.join(probe,'package.json'),JSON.stringify({name:'recorder-test-probe',version:'0.0.1',engines:{vscode:'^1.100.0'},main:'index.js'}));fs.writeFileSync(path.join(probe,'index.js'),'exports.activate=()=>{};');}
fs.writeFileSync(path.join(settings,'settings.json'),JSON.stringify({'security.workspace.trust.enabled':false,'update.mode':'none','extensions.autoUpdate':false,'telemetry.telemetryLevel':'off','workbench.startupEditor':'none','window.restoreWindows':'none'}));
runTests({vscodeExecutablePath:process.env.VSCODE_EXECUTABLE || 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
 extensionDevelopmentPath:installed?probe:root,extensionTestsPath:path.join(root,'tests','integration.cjs'),
 launchArgs:[workspace,'--user-data-dir',path.join(build,'user-data'),'--extensions-dir',path.join(build,'extensions'),...(!installed?['--disable-extensions']:[]),'--disable-gpu','--skip-welcome','--skip-release-notes'],
 extensionTestsEnv:{CODE_RECORDER_TEST_ROOT:build,CODE_RECORDER_TEST_WORKSPACE:workspace,CODE_RECORDER_INSTALLED_TEST:installed?'1':'0'}
}).catch(e=>{console.error(e);process.exitCode=1;});
