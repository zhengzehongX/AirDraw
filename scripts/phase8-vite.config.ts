import {mergeConfig} from 'vite';
import configuration from '../vite.config.ts';
/** Regression server: isolate long runs from development hot refresh. */
export default mergeConfig(configuration,{server:{host:'127.0.0.1',port:5176,strictPort:true,hmr:false}});
