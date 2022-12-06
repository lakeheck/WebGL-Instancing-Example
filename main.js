"use strict";
import * as LGL from "./js/WebGL.js";
import * as INST from "./js/Instancing.js";

LGL.resizeCanvas();

let i = new INST.Instancing(0);
i.drawScene();
