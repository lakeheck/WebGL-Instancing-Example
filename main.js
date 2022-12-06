"use strict";
import {config} from "./js/config.js"
import startGUI from "./js/GUI.js";
import {gl, ext, canvas} from "./js/WebGL.js";
import * as LGL from "./js/WebGL.js";
import * as GLSL from "./js/Shaders.js";
import * as FLUID from "./js/Fluid.js";
import * as INST from "./js/Instancing.js";

LGL.resizeCanvas();

let i = new INST.Instancing(0);
// i.drawScene();

// an indexed quad
// var arrays = {
//     position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
//     texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
//     normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
//     indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
// };

// var bufferInfo = webglUtils.createBufferInfoFromArrays(gl, i.arrays);

gl.enable(gl.DEPTH_TEST);


// setup GLSL program

// var programInfo = webglUtils.createProgramInfo(gl, ["vertex-shader-3d2", "fragment-shader-3d2"]);

// function degToRad(d) {
//     return d * Math.PI / 180;
// }

// var cameraAngleRadians = degToRad(0);
// var i.fieldOfViewRadians = degToRad(60);
// var cameraHeight = 50;

// var i.uniformsThatAreTheSameForAllObjects = {
// u_lightWorldPos:         [-50, 30, 100],
// u_viewInverse:           m4.identity(),
// u_lightColor:            [1, 1, 1, 1],
// };

var uniformsThatAreComputedForEachObject = {
u_worldViewProjection:   m4.identity(),
u_world:                 m4.identity(),
u_worldInverseTranspose: m4.identity(),
};


// //   setup GLSL boxProgram
//   var boxProgram = webglUtils.createProgramInfo(gl, ["vertex-shader-3d", "fragment-shader-3d"]);

//   // look up where the vertex data needs to go.
//   var positionLocation = gl.getAttribLocation(boxProgram.program, "a_position");
//   var texcoordLocation = gl.getAttribLocation(boxProgram.program, "a_texcoord");

//   // lookup uniforms
//   var matrixLocation = gl.getUniformLocation(boxProgram.program, "u_matrix");
//   var textureLocation = gl.getUniformLocation(boxProgram.program, "u_texture");

  // Create a buffer for positions
//   var positionBuffer = gl.createBuffer();
  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
//   gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  // Put the positions in the buffer
//   setGeometry(gl);

  // provide texture coordinates for the rectangle.
//   var texcoordBuffer = gl.createBuffer();
//   gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  // Set Texcoords.
//   setTexcoords(gl);

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

// var i.textures = [
// textureUtils.makeStripeTexture(gl, { color1: "#FFF", color2: "#CCC", }),
// textureUtils.makeCheckerTexture(gl, { color1: "#FFF", color2: "#CCC", }),
// textureUtils.makeCircleTexture(gl, { color1: "#FFF", color2: "#CCC", }),
// ];

var objects = [];
var numObjects = 300;
var baseColor = rand(240);
for (var ii = 0; ii < numObjects; ++ii) {
    i.objects.push({
        radius: rand(150),
        xRotation: rand(Math.PI * 2),
        yRotation: rand(Math.PI),
        materialUniforms: {
        u_colorMult:             chroma.hsv(rand(baseColor, baseColor + 120), 0.5, 1).gl(),
        u_diffuse:               i.textures[randInt(i.textures.length)],
        u_specular:              [1, 1, 1, 1],
        u_shininess:             rand(500),
        u_specularFactor:        rand(1),
        },
    });
}




//actual simulation construction


let input;
function initFramebuffers () {
    let dyeRes = LGL.getResolution(config.DYE_RESOLUTION);//getResolution basically just applies view aspect ratio to the passed resolution 

    const texType = ext.halfFloatTexType; //TODO - should be 32 bit floats? 
    const rgba    = ext.formatRGBA;
    const rg      = ext.formatRG;
    const r       = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    input      = LGL.createFBO     (canvas.width, canvas.height, rgba.internalFormat, rgba.format, texType, filtering);
}


// Draw the scene.
function drawScene(time) {
    time = time * 0.0001 + 5;

    // LGL.resizeCanvasToDisplaySize(gl.canvas);

    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);

    // Clear the canvas AND the depth buffer.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Compute the projection matrix
    var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    var projectionMatrix =
        m4.perspective(i.fieldOfViewRadians, aspect, 1, 2000);

    // Compute the camera's matrix using look at.
    var cameraPosition = [0, 0, 100];
    var target = [0, 0, 0];
    var up = [0, 1, 0];
    var cameraMatrix = m4.lookAt(cameraPosition, target, up, i.uniformsThatAreTheSameForAllObjects.u_viewInverse);

    // Make a view matrix from the camera matrix.
    var viewMatrix = m4.inverse(cameraMatrix);

    var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

    gl.useProgram(i.programInfo.program);

    // Setup all the needed buffers and attributes.
    webglUtils.setBuffersAndAttributes(gl, i.programInfo, i.bufferInfo);

    // Set the uniforms that are the same for all objects.
    webglUtils.setUniforms(i.programInfo, i.uniformsThatAreTheSameForAllObjects);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    
    // render cube with our 3x2 texture
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, i.targetTextureWidth, i.targetTextureHeight);
    
    // Clear the attachment(s).
    gl.clearColor(0, 0, 1, 1);   // clear to blue
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // Draw objects
    i.objects.forEach(function(object) {

        // Compute a position for this object based on the time.
        var worldMatrix = m4.xRotation(object.xRotation * time);
        worldMatrix = m4.yRotate(worldMatrix, object.yRotation * time);
        worldMatrix = m4.translate(worldMatrix, 0, 0, object.radius);
        i.uniformsThatAreComputedForEachObject.u_world = worldMatrix;

        // Multiply the matrices.
        m4.multiply(viewProjectionMatrix, worldMatrix, i.uniformsThatAreComputedForEachObject.u_worldViewProjection);
        m4.transpose(m4.inverse(worldMatrix), i.uniformsThatAreComputedForEachObject.u_worldInverseTranspose);

        // Set the uniforms we just computed
        webglUtils.setUniforms(i.programInfo, i.uniformsThatAreComputedForEachObject);

        // Set the uniforms that are specific to the this object.
        webglUtils.setUniforms(i.programInfo, object.materialUniforms);
        
        // Draw the geometry.
        gl.drawElements(gl.TRIANGLES, i.bufferInfo.numElements, gl.UNSIGNED_SHORT, 0);
        // blit(input);
        LGL.blit(input);
    });
    
    requestAnimationFrame(drawScene);
}



drawScene();


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
  