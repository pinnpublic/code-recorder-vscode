'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createVSIX}=require('@vscode/vsce');
(async()=>{
 const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
 fs.mkdirSync(path.join(root,'dist'),{recursive:true});
 await createVSIX({cwd:root,packagePath:path.join(root,'dist',`${pkg.name}-${pkg.version}.vsix`),dependencies:false,allowMissingRepository:true});
})().catch(e=>{console.error(e);process.exitCode=1;});
