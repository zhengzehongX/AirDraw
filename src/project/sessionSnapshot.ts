import {workspace} from './workspace';
import {themeController} from '../theme/themeController';
import {inspectController} from '../rendering/three/inspectController';
import type {DrawEngine} from '../engine/DrawEngine';
export function sessionSnapshot(engine:DrawEngine){return {...workspace.project,theme:themeController.mode,paper:engine.canvasBackground,camera:{yaw:inspectController.yaw,pitch:inspectController.pitch,distance:inspectController.distance},canvasView:engine.canvasNav.state()};}
