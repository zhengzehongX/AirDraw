import type {Stroke} from '../types/drawing';
export type TextSuggestion={text:string;confidence:number};
export interface RecognitionProvider {id:string;recognize(strokes:readonly Stroke[],signal:AbortSignal):Promise<TextSuggestion|null>}
/** Explicit opt-in mock; does not pretend that arbitrary handwriting was read. */
export class MockRecognitionProvider implements RecognitionProvider {
 id='mock';constructor(private expected:string|null=null){}
 async recognize(_strokes:readonly Stroke[],signal:AbortSignal){if(signal.aborted||!this.expected)return null;return{text:this.expected,confidence:1};}
}
let provider:RecognitionProvider|null=null;
/** Browser-model plugins can register here; no cloud calls are made by default. */
export function setRecognitionProvider(next:RecognitionProvider|null){provider=next;}
export function getRecognitionProvider(){return provider;}
