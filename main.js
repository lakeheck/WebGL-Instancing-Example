"use strict";
import {config} from "./js/config.js"
import startGUI from "./js/GUI.js";
import {gl, ext, canvas} from "./js/WebGL.js";
import * as LGL from "./js/WebGL.js";
import * as GLSL from "./js/Shaders.js";

resizeCanvas();


//create a prototype data structure for our pointers (ie a click or touch)
//we want to be a able to have more than one in the case of a multi - touch input 
function pointerPrototype () {
    this.id = -1;
    this.texcoordX = 0;
    this.texcoordY = 0;
    this.prevTexcoordX = 0;
    this.prevTexcoordY = 0;
    this.deltaX = 0;
    this.deltaY = 0;
    this.down = false;
    this.moved = false;
    this.color = [30, 0, 300];
}

//initialize arrays 
let pointers = [];
let splatStack = [];


//add first pointer the array of pointers 
pointers.push(new pointerPrototype());

//if the supported version of webgl does not support these features, turn off 
if (!ext.supportLinearFiltering) {
    config.DYE_RESOLUTION = 512;
    config.SHADING = false;
    config.BLOOM = false;
    config.SUNRAYS = false;
}


// an indexed quad
var arrays = {
    position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
    texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
    normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
    indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
};

var bufferInfo = webglUtils.createBufferInfoFromArrays(gl, arrays);

gl.enable(gl.DEPTH_TEST);


// setup GLSL program

var programInfo = webglUtils.createProgramInfo(gl, ["vertex-shader-3d2", "fragment-shader-3d2"]);

function degToRad(d) {
    return d * Math.PI / 180;
}

var cameraAngleRadians = degToRad(0);
var fieldOfViewRadians = degToRad(60);
var cameraHeight = 50;

var uniformsThatAreTheSameForAllObjects = {
u_lightWorldPos:         [-50, 30, 100],
u_viewInverse:           m4.identity(),
u_lightColor:            [1, 1, 1, 1],
};

var uniformsThatAreComputedForEachObject = {
u_worldViewProjection:   m4.identity(),
u_world:                 m4.identity(),
u_worldInverseTranspose: m4.identity(),
};


//   setup GLSL boxProgram
  var boxProgram = webglUtils.createProgramInfo(gl, ["vertex-shader-3d", "fragment-shader-3d"]);

  // look up where the vertex data needs to go.
  var positionLocation = gl.getAttribLocation(boxProgram.program, "a_position");
  var texcoordLocation = gl.getAttribLocation(boxProgram.program, "a_texcoord");

  // lookup uniforms
  var matrixLocation = gl.getUniformLocation(boxProgram.program, "u_matrix");
  var textureLocation = gl.getUniformLocation(boxProgram.program, "u_texture");

  // Create a buffer for positions
  var positionBuffer = gl.createBuffer();
  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  // Put the positions in the buffer
  setGeometry(gl);

  // provide texture coordinates for the rectangle.
  var texcoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  // Set Texcoords.
  setTexcoords(gl);

  // Create a texture.
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

// Create a texture to render to
  const targetTextureWidth = 1024;
  const targetTextureHeight = 1024;
  const targetTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, targetTexture);

  {
    // define size and format of level 0
    const level = 0;
    const internalFormat = gl.RGBA;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.UNSIGNED_BYTE;
    const data = null;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  targetTextureWidth, targetTextureHeight, border,
                  format, type, data);

    // set the filtering so we don't need mips
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Create and bind the framebuffer
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

  // attach the texture as the first color attachment
  const attachmentPoint = gl.COLOR_ATTACHMENT0;
  const level = 0;
  gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, targetTexture, level);


var rand = function(min, max) {
    if (max === undefined) {
        max = min;
        min = 0;
    }
    return min + Math.random() * (max - min);
};

var randInt = function(range) {
    return Math.floor(Math.random() * range);
};

var textures = [
textureUtils.makeStripeTexture(gl, { color1: "#FFF", color2: "#CCC", }),
textureUtils.makeCheckerTexture(gl, { color1: "#FFF", color2: "#CCC", }),
textureUtils.makeCircleTexture(gl, { color1: "#FFF", color2: "#CCC", }),
];

var objects = [];
var numObjects = 300;
var baseColor = rand(240);
for (var ii = 0; ii < numObjects; ++ii) {
    objects.push({
        radius: rand(150),
        xRotation: rand(Math.PI * 2),
        yRotation: rand(Math.PI),
        materialUniforms: {
        u_colorMult:             chroma.hsv(rand(baseColor, baseColor + 120), 0.5, 1).gl(),
        u_diffuse:               textures[randInt(textures.length)],
        u_specular:              [1, 1, 1, 1],
        u_shininess:             rand(500),
        u_specularFactor:        rand(1),
        },
    });
}
var fieldOfViewRadians = degToRad(60);


const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    //create an array of attributes for our vertices
    //two numbers per vertex, for x and y coordinates 
    //(-1,1) -> bottom left
    //(-1,1) -> top left 
    //(1,1,) -> top right
    //(1,-1) -> bottom right
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    //think this is numbering our vertices and grouping them
    //one triangle with vertices numbered 0,1,2
    //one trianlge with vertices numbered 0,2,3
    //ie triangles one and two both share vertices 0, 2 and each have a unique vertex (vtx 1 and 3 respectivey)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    //intended to be used with output from LGL.createFBO
    //if we dont pass a target, then we want to create a viewport with the overall dimensions 
    //otherwise we can take our target dimensions (means we dont have to worry about sim res vs output res here)
    //clear = false is a keyword arguement set to "false" by default 
    return (target, clear = false) => {
        if (target == null)
        {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        else
        {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clear)
        {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        // CHECK_FRAMEBUFFER_STATUS();
        
        
        //do the actual drawing 
        //here we will use a triangle mesh 
        //draw 6 triangles 
        //unsigned short is the type of our vertex data 
        //offest is 0
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

function CHECK_FRAMEBUFFER_STATUS () {
    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status != gl.FRAMEBUFFER_COMPLETE)
        console.trace("Framebuffer error: " + status);
}

//actual simulation construction

let dye;
let velocity;
let divergence;
let curl;
let pressure;
let bloom;
let bloomFramebuffers = [];
let sunrays;
let sunraysTemp;
let noise;
let input;
//load texture for dithering
let ditheringTexture = createTextureAsync('LDR_LLL1_0.png');
let picture = createTextureAsync('img/flowers_fence.JPG');
// let picture = createTextureAsync('img/lake-heckaman-IMG_0997-dec-2022.jpg');
// console.log('loaded picture successfully');

//create all our shader programs 
const blurProgram               = new LGL.Program(GLSL.blurVertexShader, GLSL.blurShader);
const copyProgram               = new LGL.Program(GLSL.baseVertexShader, GLSL.copyShader);
const clearProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.clearShader);
const colorProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.colorShader);
const checkerboardProgram       = new LGL.Program(GLSL.baseVertexShader, GLSL.checkerboardShader);
const bloomPrefilterProgram     = new LGL.Program(GLSL.baseVertexShader, GLSL.bloomPrefilterShader);
const bloomBlurProgram          = new LGL.Program(GLSL.baseVertexShader, GLSL.bloomBlurShader);
const bloomFinalProgram         = new LGL.Program(GLSL.baseVertexShader, GLSL.bloomFinalShader);
const sunraysMaskProgram        = new LGL.Program(GLSL.baseVertexShader, GLSL.sunraysMaskShader);
const sunraysProgram            = new LGL.Program(GLSL.baseVertexShader, GLSL.sunraysShader);
const splatProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.splatShader);
const splatColorClickProgram    = new LGL.Program(GLSL.baseVertexShader, GLSL.splatColorClickShader);
const splatVelProgram           = new LGL.Program(GLSL.baseVertexShader, GLSL.splatVelShader); //added to support color / vel map
const splatColorProgram         = new LGL.Program(GLSL.baseVertexShader, GLSL.splatColorShader); //added to support color / vel map
const advectionProgram          = new LGL.Program(GLSL.baseVertexShader, GLSL.advectionShader);
const divergenceProgram         = new LGL.Program(GLSL.baseVertexShader, GLSL.divergenceShader);
const curlProgram               = new LGL.Program(GLSL.baseVertexShader, GLSL.curlShader);
const vorticityProgram          = new LGL.Program(GLSL.baseVertexShader, GLSL.vorticityShader);
const pressureProgram           = new LGL.Program(GLSL.baseVertexShader, GLSL.pressureShader);
const gradientSubtractProgram   = new LGL.Program(GLSL.baseVertexShader, GLSL.gradientSubtractShader);
const noiseProgram              = new LGL.Program(GLSL.baseVertexShader, GLSL.noiseShader); //noise generator 


//create a material from our display shader source to capitalize on the #defines for optimization 
//TODO - do we have to compile this source differently since there are the defines? 
//this also allows us to only use the active uniforms 
const displayMaterial = new LGL.Material(GLSL.baseVertexShader, GLSL.displayShaderSource);


function initFramebuffers () {
    let simRes = getResolution(config.SIM_RESOLUTION);//getResolution basically just applies view aspect ratio to the passed resolution 
    let dyeRes = getResolution(config.DYE_RESOLUTION);//getResolution basically just applies view aspect ratio to the passed resolution 

    const texType = ext.halfFloatTexType; //TODO - should be 32 bit floats? 
    const rgba    = ext.formatRGBA;
    const rg      = ext.formatRG;
    const r       = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    //use helper function to create pairs of buffer objects that will be ping pong'd for our sim 
    //this lets us define the buffer objects that we wil want to use for feedback 
    if (dye == null || noise == null){
        dye = LGL.createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        noise = LGL.createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    }
    else {//resize if needed 
        dye = LGL.resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        noise = LGL.resizeDoubleFBO(noise, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    }
    if (velocity == null)
        velocity = LGL.createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else //resize if needed 
        velocity = LGL.resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    //other buffer objects that dont need feedback / ping-pong 
    //notice the filtering type is set to gl.NEAREST meaning we grab just a single px, no filtering 
    divergence = LGL.createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl       = LGL.createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure   = LGL.createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    input      = LGL.createFBO     (dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    // noise       = LGL.createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    //setup buffers for post process 
    // input=picture;
    initBloomFramebuffers();
    initSunraysFramebuffers();
}

function initBloomFramebuffers () {
    let res = getResolution(config.BLOOM_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    bloom = LGL.createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);

    bloomFramebuffers.length = 0;
    for (let i = 0; i < config.BLOOM_ITERATIONS; i++)
    {
        //right shift resolution by iteration amount 
        // ie we reduce the resolution by a factor of 2^i, or rightshift(x,y) -> x/pow(2,y)
        // (1024 >> 1 = 512)
        // so basically creating mipmaps
        let width = res.width >> (i + 1);
        let height = res.height >> (i + 1);

        if (width < 2 || height < 2) break;

        let fbo = LGL.createFBO(width, height, rgba.internalFormat, rgba.format, texType, filtering);
        bloomFramebuffers.push(fbo);
    }
}

function initSunraysFramebuffers () {
    let res = getResolution(config.SUNRAYS_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    sunrays     = LGL.createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
    sunraysTemp = LGL.createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
}



function createTextureAsync (url) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

    let obj = {
        texture,
        width: 1,
        height: 1,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };

    let image = new Image();
    image.onload = () => {
        obj.width = image.width;
        obj.height = image.height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    };
    image.src = url;

    return obj;
}

// function LGL.updateKeywords () {
//     let displayKeywords = [];
//     if (config.SHADING) displayKeywords.push("SHADING");
//     if (config.BLOOM) displayKeywords.push("BLOOM");
//     if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
//     displayMaterial.setKeywords(displayKeywords);
// }


// Draw the scene.
function drawScene(time) {
    time = time * 0.0001 + 5;

    // resizeCanvasToDisplaySize(gl.canvas);

    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);

    // Clear the canvas AND the depth buffer.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Compute the projection matrix
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var projectionMatrix =
        m4.perspective(fieldOfViewRadians, aspect, 1, 2000);

    // Compute the camera's matrix using look at.
    var cameraPosition = [0, 0, 100];
    var target = [0, 0, 0];
    var up = [0, 1, 0];
    var cameraMatrix = m4.lookAt(cameraPosition, target, up, uniformsThatAreTheSameForAllObjects.u_viewInverse);

    // Make a view matrix from the camera matrix.
    var viewMatrix = m4.inverse(cameraMatrix);

    var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

    gl.useProgram(programInfo.program);

    // Setup all the needed buffers and attributes.
    webglUtils.setBuffersAndAttributes(gl, programInfo, bufferInfo);

    // Set the uniforms that are the same for all objects.
    webglUtils.setUniforms(programInfo, uniformsThatAreTheSameForAllObjects);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    
    // render cube with our 3x2 texture
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, targetTextureWidth, targetTextureHeight);
    
    // Clear the attachment(s).
    gl.clearColor(0, 0, 1, 1);   // clear to blue
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // Draw objects
    objects.forEach(function(object) {

        // Compute a position for this object based on the time.
        var worldMatrix = m4.xRotation(object.xRotation * time);
        worldMatrix = m4.yRotate(worldMatrix, object.yRotation * time);
        worldMatrix = m4.translate(worldMatrix, 0, 0, object.radius);
        uniformsThatAreComputedForEachObject.u_world = worldMatrix;

        // Multiply the matrices.
        m4.multiply(viewProjectionMatrix, worldMatrix, uniformsThatAreComputedForEachObject.u_worldViewProjection);
        m4.transpose(m4.inverse(worldMatrix), uniformsThatAreComputedForEachObject.u_worldInverseTranspose);

        // Set the uniforms we just computed
        webglUtils.setUniforms(programInfo, uniformsThatAreComputedForEachObject);

        // Set the uniforms that are specific to the this object.
        webglUtils.setUniforms(programInfo, object.materialUniforms);
        
        // Draw the geometry.
        gl.drawElements(gl.TRIANGLES, bufferInfo.numElements, gl.UNSIGNED_SHORT, 0);
        // blit(input);
        blit(input);
    });
    
    requestAnimationFrame(drawScene);
}


//actually calling our functions to make program work 
startGUI(config, initFramebuffers, LGL.updateKeywords);
LGL.updateKeywords(config, displayMaterial);
initFramebuffers();
multipleSplats(parseInt(Math.random() * 20) + 5);
let noiseSeed = 0.0; 
let lastUpdateTime = Date.now();
let colorUpdateTimer = 0.0;
drawScene();
update();


//simulation step 
function update () {
    //time step 
    const dt = calcDeltaTime();
    noiseSeed += dt * config.NOISE_TRANSLATE_SPEED;
    // if (resizeCanvas()) //resize if needed 
    //     initFramebuffers();
    updateColors(dt); //step through our sim 
    applyInputs(); //take from ui
    if (!config.PAUSED)
        step(dt); //do a calculation step 
    render(null);
    requestAnimationFrame(update);
}

function calcDeltaTime () {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666); //never want to update slower than 60fps
    lastUpdateTime = now;
    return dt;
}

function resizeCanvas () {
    let width = scaleByPixelRatio(canvas.clientWidth);
    let height = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }
    return false;
}


function updateColors (dt) {//used to update the color map for each pointer, which happens slower than the entire sim updates 
    if (!config.COLORFUL) return;
    
    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
        pointers.forEach(p => {
            p.color = generateColor();
        });
    }
}

function applyInputs () {
    if (splatStack.length > 0) //if there are splats then recreate them
    multipleSplats(splatStack.pop());//TODO - verify what elemetns of splatStack are and what splatStack.pop() will return (should be int??)
    
    
    pointers.forEach(p => { //create a splat for our pointers 
        if (p.moved) {
            p.moved = false;
            splatPointer(p);
        }
    });
}


//the simulation, finally! 
function step (dt) {
    gl.disable(gl.BLEND);
    noiseProgram.bind();
    gl.uniform1f(noiseProgram.uniforms.uPeriod, config.PERIOD); 
    gl.uniform3f(noiseProgram.uniforms.uTranslate, 0.0, 0.0, 0.0);
    gl.uniform1f(noiseProgram.uniforms.uAmplitude, config.AMP); 
    gl.uniform1f(noiseProgram.uniforms.uSeed, noiseSeed); 
    gl.uniform1f(noiseProgram.uniforms.uExponent, config.EXPONENT); 
    gl.uniform1f(noiseProgram.uniforms.uRidgeThreshold, config.RIDGE); 
    gl.uniform1f(noiseProgram.uniforms.uLacunarity, config.LACUNARITY); 
    gl.uniform1f(noiseProgram.uniforms.uGain, config.GAIN); 
    gl.uniform1f(noiseProgram.uniforms.uOctaves, config.OCTAVES); 
    gl.uniform3f(noiseProgram.uniforms.uScale, 1., 1., 1.); 
    gl.uniform1f(noiseProgram.uniforms.uAspect, config.ASPECT); 
    blit(noise.write);
    noise.swap();

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);
    
    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();
    
    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);
    
    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();
    
    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
    }
    
    gradientSubtractProgram.bind();
    gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    if(config.FORCE_MAP_ENABLE){
        splatVelProgram.bind();
        gl.uniform1i(splatVelProgram.uniforms.uTarget, velocity.read.attach(0)); 
        // gl.uniform1i(splatVelProgram.uniforms.uTarget, velocity.read.attach(0));
        gl.uniform1i(splatVelProgram.uniforms.uDensityMap, input.attach(1)); //density map
        gl.uniform1i(splatVelProgram.uniforms.uForceMap, noise.read.attach(2)); //add noise for velocity map 
        gl.uniform1f(splatVelProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform1f(splatVelProgram.uniforms.uVelocityScale, config.VELOCITYSCALE);
        gl.uniform2f(splatVelProgram.uniforms.point, 0, 0);
        gl.uniform3f(splatVelProgram.uniforms.color, 0, 0, 1);
        gl.uniform1i(splatVelProgram.uniforms.uClick, 0);
        gl.uniform1f(splatVelProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
        blit(velocity.write);
        velocity.swap();
    }

    if(config.DENSITY_MAP_ENABLE){
        splatColorProgram.bind();
        gl.uniform1f(splatColorProgram.uniforms.uFlow, config.FLOW);
        gl.uniform1f(splatColorProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(splatColorProgram.uniforms.point, 0, 0);
        gl.uniform1i(splatColorProgram.uniforms.uTarget, dye.read.attach(0));
        gl.uniform1i(splatColorProgram.uniforms.uColor, input.attach(1)); //color map
        gl.uniform1i(splatColorProgram.uniforms.uDensityMap, input.attach(2)); //density map
        gl.uniform1i(splatVelProgram.uniforms.uClick, 0);
        gl.uniform1f(splatColorProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
        blit(dye.write);
        dye.swap();
    }
    
    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering)
    gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    let velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();
    
    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
        gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
        gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
        blit(dye.write);
    dye.swap();
}

function render (target) {
    if (config.BLOOM)
        applyBloom(dye.read, bloom);
        if (config.SUNRAYS) {
            applySunrays(dye.read, dye.write, sunrays);
            blur(sunrays, sunraysTemp, 1);
        }
        
        if (target == null || !config.TRANSPARENT) {
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.enable(gl.BLEND);
        }
        else {
            gl.disable(gl.BLEND);
        }
        
        if (!config.TRANSPARENT)
        drawColor(target, normalizeColor(config.BACK_COLOR));
        if (target == null && config.TRANSPARENT)
        drawCheckerboard(target);

        // dye.read = input;//kinda cool, this will essentially apply fliud sim to next frame, not both frames
        // dye.write = input;//set write to input, with both this is like feedback without decay
        if(config.DISPLAY_FLUID){
            drawDisplay(target);
        }
        else{
            drawDisplay(noise);
        }
        // blit(picture);
    
    }
    
    function drawColor (target, color) {
        colorProgram.bind();
        gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
        blit(target);
    }
    
    function drawCheckerboard (target) {
        checkerboardProgram.bind();
        gl.uniform1f(checkerboardProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        blit(target);
    }
    
    function drawDisplay (target) {
        let width = target == null ? gl.drawingBufferWidth : target.width;
        let height = target == null ? gl.drawingBufferHeight : target.height;
        
    displayMaterial.bind();
    if (config.SHADING)
        gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
    // gl.uniform1i(displayMaterial.uniforms.uTexture, picture.attach(0)); //this works to get the image in the background, but is not actually
    // gl.uniform1i(displayMaterial.uniforms.uTexture, noise.read.attach(0));
    if(config.DISPLAY_FLUID){
        gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    }
    else{
        gl.uniform1i(displayMaterial.uniforms.uTexture, noise.read.attach(0));
    }
    if (config.BLOOM) {
        gl.uniform1i(displayMaterial.uniforms.uBloom, bloom.attach(1));
        gl.uniform1i(displayMaterial.uniforms.uDithering, ditheringTexture.attach(2));
        let scale = getTextureScale(ditheringTexture, width, height);
        gl.uniform2f(displayMaterial.uniforms.ditherScale, scale.x, scale.y);
    }
    if (config.SUNRAYS)
        gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));
    blit(target);
}

function applyBloom (source, destination) {
    if (bloomFramebuffers.length < 2)
        return;

    let last = destination;

    gl.disable(gl.BLEND);
    bloomPrefilterProgram.bind();
    let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
    let curve0 = config.BLOOM_THRESHOLD - knee;
    let curve1 = knee * 2;
    let curve2 = 0.25 / knee;
    gl.uniform3f(bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
    gl.uniform1f(bloomPrefilterProgram.uniforms.threshold, config.BLOOM_THRESHOLD);
    gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
    blit(last);

    bloomBlurProgram.bind();
    for (let i = 0; i < bloomFramebuffers.length; i++) {
        let dest = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
        blit(dest);
        last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
        let baseTex = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
        gl.viewport(0, 0, baseTex.width, baseTex.height);
        blit(baseTex);
        last = baseTex;
    }

    gl.disable(gl.BLEND);
    bloomFinalProgram.bind();
    gl.uniform2f(bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0));
    gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY);
    blit(destination);
}

function applySunrays (source, mask, destination) {
    gl.disable(gl.BLEND);
    sunraysMaskProgram.bind();
    gl.uniform1i(sunraysMaskProgram.uniforms.uTexture, source.attach(0));
    blit(mask);

    sunraysProgram.bind();
    gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
    gl.uniform1i(sunraysProgram.uniforms.uTexture, mask.attach(0));
    blit(destination);
}

function blur (target, temp, iterations) {
    blurProgram.bind();
    for (let i = 0; i < iterations; i++) {
        gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
        gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
        blit(temp);

        gl.uniform2f(blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
        gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
        blit(target);
    }
}

function splatPointer (pointer) {
    let dx = pointer.deltaX * config.SPLAT_FORCE;
    let dy = pointer.deltaY * config.SPLAT_FORCE;
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
}

function multipleSplats (amount) {
    for (let i = 0; i < amount; i++) {
        const color = generateColor();
        color.r *= 10.0;
        color.g *= 10.0;
        color.b *= 10.0;
        const x = Math.random();
        const y = Math.random();
        const dx = 1000 * (Math.random() - 0.5);
        const dy = 1000 * (Math.random() - 0.5);
        splat(x, y, dx, dy, color);
    }
}

function splat (x, y, dx, dy, color) {
    //when we click, we just want to add velocity to the sim locally 
    //so we use the delta in position between clicks and add that to the vel map
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
    blit(velocity.write);
    velocity.swap();

    //pulling the color to add to the sim from a colormap 
    splatColorClickProgram.bind();
    gl.uniform1f(splatColorClickProgram.uniforms.uFlow, config.SPLAT_FLOW);
    gl.uniform1f(splatColorClickProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatColorClickProgram.uniforms.point, x, y);
    gl.uniform1i(splatColorClickProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform1i(splatColorClickProgram.uniforms.uColor, input.attach(1));
    gl.uniform1f(splatColorClickProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
    blit(dye.write);
    dye.swap();
}

function correctRadius (radius) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1)
        radius *= aspectRatio;
    return radius;
}

canvas.addEventListener('mousedown', e => {
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    let pointer = pointers.find(p => p.id == -1);
    if (pointer == null)
        pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', e => {
    let pointer = pointers[0];
    if (!pointer.down) return;
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
    updatePointerUpData(pointers[0]);
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    while (touches.length >= pointers.length)
        pointers.push(new pointerPrototype());
    for (let i = 0; i < touches.length; i++) {
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
    }
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers[i + 1];
        if (!pointer.down) continue;
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerMoveData(pointer, posX, posY);
    }
}, false);

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
    {
        let pointer = pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        updatePointerUpData(pointer);
    }
});

window.addEventListener('keydown', e => {
    if (e.code === 'KeyP')
        config.PAUSED = !config.PAUSED;
    if (e.key === ' ')
        splatStack.push(parseInt(Math.random() * 20) + 5);
});

function updatePointerDownData (pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = generateColor();
}

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
    pointer.down = false;
}

function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

function generateColor () {
    let c = HSVtoRGB(Math.random(), 1.0, 1.0);
    c.r *= 0.15;
    c.g *= 0.15;
    c.b *= 0.15;
    return c;
}

function HSVtoRGB (h, s, v) {
    let r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return {
        r,
        g,
        b
    };
}

function normalizeColor (input) {
    let output = {
        r: input.r / 255,
        g: input.g / 255,
        b: input.b / 255
    };
    return output;
}

function wrap (value, min, max) {
    let range = max - min;
    if (range == 0) return min;
    return (value - min) % range + min;
}

function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1)
        aspectRatio = 1.0 / aspectRatio;

    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}

function getTextureScale (texture, width, height) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}

function scaleByPixelRatio (input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

function hashCode (s) {
    if (s.length == 0) return 0;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};


// Fill the buffer with the values that define a cube.
function setGeometry(gl) {
    var positions = new Float32Array(
      [
      -0.5, -0.5,  -0.5,
      -0.5,  0.5,  -0.5,
       0.5, -0.5,  -0.5,
      -0.5,  0.5,  -0.5,
       0.5,  0.5,  -0.5,
       0.5, -0.5,  -0.5,
  
      -0.5, -0.5,   0.5,
       0.5, -0.5,   0.5,
      -0.5,  0.5,   0.5,
      -0.5,  0.5,   0.5,
       0.5, -0.5,   0.5,
       0.5,  0.5,   0.5,
  
      -0.5,   0.5, -0.5,
      -0.5,   0.5,  0.5,
       0.5,   0.5, -0.5,
      -0.5,   0.5,  0.5,
       0.5,   0.5,  0.5,
       0.5,   0.5, -0.5,
  
      -0.5,  -0.5, -0.5,
       0.5,  -0.5, -0.5,
      -0.5,  -0.5,  0.5,
      -0.5,  -0.5,  0.5,
       0.5,  -0.5, -0.5,
       0.5,  -0.5,  0.5,
  
      -0.5,  -0.5, -0.5,
      -0.5,  -0.5,  0.5,
      -0.5,   0.5, -0.5,
      -0.5,  -0.5,  0.5,
      -0.5,   0.5,  0.5,
      -0.5,   0.5, -0.5,
  
       0.5,  -0.5, -0.5,
       0.5,   0.5, -0.5,
       0.5,  -0.5,  0.5,
       0.5,  -0.5,  0.5,
       0.5,   0.5, -0.5,
       0.5,   0.5,  0.5,
  
      ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  }
  
  // Fill the buffer with texture coordinates the cube.
  function setTexcoords(gl) {
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(
          [
            0, 0,
            0, 1,
            1, 0,
            0, 1,
            1, 1,
            1, 0,
  
            0, 0,
            0, 1,
            1, 0,
            1, 0,
            0, 1,
            1, 1,
  
            0, 0,
            0, 1,
            1, 0,
            0, 1,
            1, 1,
            1, 0,
  
            0, 0,
            0, 1,
            1, 0,
            1, 0,
            0, 1,
            1, 1,
  
            0, 0,
            0, 1,
            1, 0,
            0, 1,
            1, 1,
            1, 0,
  
            0, 0,
            0, 1,
            1, 0,
            1, 0,
            0, 1,
            1, 1,
  
        ]),
        gl.STATIC_DRAW);
  }
  

  function getWebGLContext (canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    //get webgl context. note webgl2
    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2)
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    //find out if our current webgl context supports certain features 
    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2)//believe this is standardizing texture pixel format (aliases) based on webgl version
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    }
    else
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    return {
        gl,
        ext: {
            formatRGBA,
            formatRG,
            formatR,
            halfFloatTexType,
            supportLinearFiltering
        }
    };
}

function getSupportedFormat (gl, internalFormat, format, type)
{
    if (!supportRenderTextureFormat(gl, internalFormat, format, type))
    {
        switch (internalFormat)
        {
            case gl.R16F:
                return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
            case gl.RG16F:
                return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
            default:
                return null;
        }
    }

    return {
        internalFormat,
        format
    }
}

//test case to check that the correct pixel types are supported 
//setup a gl texture
//set the texture params 
//create a 2d image tex
//create a frame buffer and bind the texture to it 
//check tosee if the buffer object correctly accepcted texture 
//TODO - enhance understanding of texture setup 
function supportRenderTextureFormat (gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status == gl.FRAMEBUFFER_COMPLETE;
}

