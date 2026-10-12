export type Command={name:string;apply:()=>void;revert:()=>void};
/** Commands share immutable trajectory/asset references; no model clones per frame. */
export class CommandHistory {
  private past:Command[]=[];private future:Command[]=[];
  constructor(private limit=100){}
  execute(command:Command){command.apply();this.past.push(command);if(this.past.length>this.limit)this.past.shift();this.future=[];}
  undo(){const c=this.past.pop();if(!c)return false;c.revert();this.future.push(c);return true;}
  redo(){const c=this.future.pop();if(!c)return false;c.apply();this.past.push(c);return true;}
  clear(){this.past=[];this.future=[];}
  get canUndo(){return this.past.length>0;}get canRedo(){return this.future.length>0;}
}
