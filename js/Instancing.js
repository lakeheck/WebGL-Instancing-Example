import {config} from "./config.js"
import * as LGL from "./WebGL.js";
import * as GLSL from "./Shaders.js";
import {gl, ext, canvas} from "./WebGL.js";

export class Instancing{

    constructor(n){
        this.numObjects = 300;
        this.objects = [];
        this.time = 0;
        this.init();
    }

    arrays = {
    position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
    texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
    normal:   { numComponents: 3, data: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],     },
    indices:  { numComponents: 3, data: [0, 1, 2, 1, 2, 3],                       },
    };

    bufferInfo = webglUtils.createBufferInfoFromArrays(gl, this.arrays);
    programInfo = webglUtils.createProgramInfo(gl, [`uniform mat4 u_worldViewProjection;
    uniform vec3 u_lightWorldPos;
    uniform mat4 u_world;
    uniform mat4 u_viewInverse;
    uniform mat4 u_worldInverseTranspose;
  
    attribute vec4 a_position;
    attribute vec3 a_normal;
    attribute vec2 a_texcoord;
  
    varying vec4 v_position;
    varying vec2 v_texCoord;
    varying vec3 v_normal;
    varying vec3 v_surfaceToLight;
    varying vec3 v_surfaceToView;
  
    void main() {
      v_texCoord = a_texcoord;
      v_position = (u_worldViewProjection * a_position);
      v_normal = (u_worldInverseTranspose * vec4(a_normal, 0)).xyz;
      v_surfaceToLight = u_lightWorldPos - (u_world * a_position).xyz;
      v_surfaceToView = (u_viewInverse[3] - (u_world * a_position)).xyz;
      gl_Position = v_position;
    }`, `precision mediump float;

    varying vec4 v_position;
    varying vec2 v_texCoord;
    varying vec3 v_normal;
    varying vec3 v_surfaceToLight;
    varying vec3 v_surfaceToView;
    
    uniform vec4 u_lightColor;
    uniform vec4 u_colorMult;
    uniform sampler2D u_diffuse;
    uniform vec4 u_specular;
    uniform float u_shininess;
    uniform float u_specularFactor;
    
    vec4 lit(float l ,float h, float m) {
      return vec4(1.0,
                  abs(l),
                  (l > 0.0) ? pow(max(0.0, h), m) : 0.0,
                  1.0);
    }
    
    void main() {
      vec4 diffuseColor = texture2D(u_diffuse, v_texCoord);
      vec3 a_normal = normalize(v_normal);
      vec3 surfaceToLight = normalize(v_surfaceToLight);
      vec3 surfaceToView = normalize(v_surfaceToView);
      vec3 halfVector = normalize(surfaceToLight + surfaceToView);
      vec4 litR = lit(dot(a_normal, surfaceToLight),
                        dot(a_normal, halfVector), u_shininess);
      vec4 outColor = vec4((
      u_lightColor * (diffuseColor * litR.y * u_colorMult +
                    u_specular * litR.z * u_specularFactor)).rgb,
          diffuseColor.a);
      gl_FragColor = outColor;
    //  gl_FragColor = vec4(litR.yyy, 1);
    }`]);

    cameraAngleRadians = LGL.degToRad(0);
    fieldOfViewRadians = LGL.degToRad(60);
    cameraHeight = 50;
    positionBuffer = gl.createBuffer();
    texture = gl.createTexture();
    frameBuffer;
    output;

    targetTextureWidth = 1024; 
    targetTextureHeight = 1024; 

    uniformsThatAreTheSameForAllObjects = {
        u_lightWorldPos:         [-50, 30, 100],
        u_viewInverse:           m4.identity(),
        u_lightColor:            [1, 1, 1, 1],
    };

    uniformsThatAreComputedForEachObject = {
        u_worldViewProjection:   m4.identity(),
        u_world:                 m4.identity(),
        u_worldInverseTranspose: m4.identity(),
        };


    textures = [
        textureUtils.makeStripeTexture(gl, { color1: "#FFF", color2: "#CCC", }),
        textureUtils.makeCheckerTexture(gl, { color1: "#FFF", color2: "#CCC", }),
        textureUtils.makeCircleTexture(gl, { color1: "#FFF", color2: "#CCC", }),
        ];

    init(){
        gl.enable(gl.DEPTH_TEST);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        this.targetTextureWidth = 1024;
        this.targetTextureHeight = 1024;
        this.targetTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.targetTexture);
        {
            // define size and format of level 0
            const level = 0;
            const internalFormat = gl.RGBA;
            const border = 0;
            const format = gl.RGBA;
            const type = gl.UNSIGNED_BYTE;
            const data = null;
            gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                        this.targetTextureWidth, this.targetTextureHeight, border,
                        format, type, data);

            // set the filtering so we don't need mips
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        this.frameBuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
        const attachmentPoint = gl.COLOR_ATTACHMENT0;
        const level = 0;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, this.targetTexture, level);

        this.initObjects();
        this.initFramebuffers();
    }

    initObjects(){
        var baseColor = rand(240);
        for (var ii = 0; ii < this.numObjects; ++ii) {
        this.objects.push({
            radius: rand(150),
            xRotation: rand(Math.PI * 2),
            yRotation: rand(Math.PI),
            materialUniforms: {
            u_colorMult:             chroma.hsv(rand(baseColor, baseColor + 120), 0.5, 1).gl(),
            u_diffuse:               this.textures[randInt(this.textures.length)],
            u_specular:              [1, 1, 1, 1],
            u_shininess:             rand(500),
            u_specularFactor:        rand(1),
            },
            });
        }
    }

    initFramebuffers () {
    
        const texType = ext.halfFloatTexType; //TODO - should be 32 bit floats? 
        const rgba    = ext.formatRGBA;
        const rg      = ext.formatRG;
        const r       = ext.formatR;
        const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    
        this.output      = LGL.createFBO     (canvas.width, canvas.height, rgba.internalFormat, rgba.format, texType, filtering);
    }


    drawScene() {
        this.time += 0.01;
    
        // LGL.resizeCanvasToDisplaySize(gl.canvas);
    
        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    
        // Clear the canvas AND the depth buffer.
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
        // Compute the projection matrix
        var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        var projectionMatrix =
            m4.perspective(this.fieldOfViewRadians, aspect, 1, 2000);
    
        // Compute the camera's matrix using look at.
        var cameraPosition = [0, 0, 100];
        var target = [0, 0, 0];
        var up = [0, 1, 0];
        var cameraMatrix = m4.lookAt(cameraPosition, target, up, this.uniformsThatAreTheSameForAllObjects.u_viewInverse);
    
        // Make a view matrix from the camera matrix.
        var viewMatrix = m4.inverse(cameraMatrix);
    
        var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);
    
        gl.useProgram(this.programInfo.program);
    
        // Setup all the needed buffers and attributes.
        webglUtils.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
    
        // Set the uniforms that are the same for all objects.
        webglUtils.setUniforms(this.programInfo, this.uniformsThatAreTheSameForAllObjects);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
        
        // render cube with our 3x2 texture
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Tell WebGL how to convert from clip space to pixels
        gl.viewport(0, 0, this.targetTextureWidth, this.targetTextureHeight);
        
        // Clear the attachment(s).
        gl.clearColor(0, 0, 1, 1);   // clear to blue
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        // Draw objects

        let parent = this;

        this.objects.forEach(function(object) {
    
            // Compute a position for this object based on the time.
            var worldMatrix = m4.xRotation(object.xRotation * parent.time);
            worldMatrix = m4.yRotate(worldMatrix, object.yRotation * parent.time);
            worldMatrix = m4.translate(worldMatrix, 0, 0, object.radius);
            parent.uniformsThatAreComputedForEachObject.u_world = worldMatrix;
    
            // Multiply the matrices.
            m4.multiply(viewProjectionMatrix, worldMatrix, parent.uniformsThatAreComputedForEachObject.u_worldViewProjection);
            m4.transpose(m4.inverse(worldMatrix), parent.uniformsThatAreComputedForEachObject.u_worldInverseTranspose);
    
            // Set the uniforms we just computed
            webglUtils.setUniforms(parent.programInfo, parent.uniformsThatAreComputedForEachObject);
    
            // Set the uniforms that are specific to the this object.
            webglUtils.setUniforms(parent.programInfo, object.materialUniforms);
            
            // Draw the geometry.
            gl.drawElements(gl.TRIANGLES, parent.bufferInfo.numElements, gl.UNSIGNED_SHORT, 0);
            // blit(input);
            LGL.blit(null);
        });
        
        requestAnimationFrame(() => this.drawScene(this));
    }

}

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
