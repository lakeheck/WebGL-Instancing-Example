import {config} from "./config.js"
import * as LGL from "./WebGL.js";
import * as GLSL from "./Shaders.js";
import {gl, ext, canvas} from "./WebGL.js";

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

let ditheringTexture = LGL.createTextureAsync('LDR_LLL1_0.png');
let picture = LGL.createTextureAsync('img/flowers_fence.JPG');

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



export function initFramebuffers () {
    let simRes = LGL.getResolution(config.SIM_RESOLUTION);//getResolution basically just applies view aspect ratio to the passed resolution 
    let dyeRes = LGL.getResolution(config.DYE_RESOLUTION);//getResolution basically just applies view aspect ratio to the passed resolution 

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

function initSunraysFramebuffers () {
    let res = LGL.getResolution(config.SUNRAYS_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    sunrays     = LGL.createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
    sunraysTemp = LGL.createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
}

export function initBloomFramebuffers () {
    let res = LGL.getResolution(config.BLOOM_RESOLUTION);

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


export function updateColors (dt, pointers, colorUpdateTimer) {//used to update the color map for each pointer, which happens slower than the entire sim updates 
    if (!config.COLORFUL) return;
    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
        pointers.forEach(p => {
            p.color = LGL.generateColor();
        });
    }
}

export function applyInputs (splatStack, pointers) {
    if (splatStack.length > 0) //if there are splats then recreate them
    multipleSplats(splatStack.pop());//TODO - verify what elemetns of splatStack are and what splatStack.pop() will return (should be int??)
    pointers.forEach(p => { //create a splat for our pointers 
        if (p.moved) {
            p.moved = false;
            splatPointer(p);
        }
    });
}

function splatPointer (pointer) {
    let dx = pointer.deltaX * config.SPLAT_FORCE;
    let dy = pointer.deltaY * config.SPLAT_FORCE;
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
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
    LGL.blit(velocity.write);
    velocity.swap();

    //pulling the color to add to the sim from a colormap 
    splatColorClickProgram.bind();
    gl.uniform1f(splatColorClickProgram.uniforms.uFlow, config.SPLAT_FLOW);
    gl.uniform1f(splatColorClickProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatColorClickProgram.uniforms.point, x, y);
    gl.uniform1i(splatColorClickProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform1i(splatColorClickProgram.uniforms.uColor, input.attach(1));
    gl.uniform1f(splatColorClickProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
    LGL.blit(dye.write);
    dye.swap();
}

export function multipleSplats (amount) {
    for (let i = 0; i < amount; i++) {
        const color = LGL.generateColor();
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

function drawDisplay (target, displayMaterial) {
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
    LGL.blit(target);
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
    LGL.blit(last);

    bloomBlurProgram.bind();
    for (let i = 0; i < bloomFramebuffers.length; i++) {
        let dest = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
        LGL.blit(dest);
        last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
        let baseTex = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
        gl.viewport(0, 0, baseTex.width, baseTex.height);
        LGL.blit(baseTex);
        last = baseTex;
    }

    gl.disable(gl.BLEND);
    bloomFinalProgram.bind();
    gl.uniform2f(bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0));
    gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY);
    LGL.blit(destination);
}

function applySunrays (source, mask, destination) {
    gl.disable(gl.BLEND);
    sunraysMaskProgram.bind();
    gl.uniform1i(sunraysMaskProgram.uniforms.uTexture, source.attach(0));
    LGL.blit(mask);

    sunraysProgram.bind();
    gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
    gl.uniform1i(sunraysProgram.uniforms.uTexture, mask.attach(0));
    LGL.blit(destination);
}

function blur (target, temp, iterations) {
    blurProgram.bind();
    for (let i = 0; i < iterations; i++) {
        gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
        gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
        LGL.blit(temp);

        gl.uniform2f(blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
        gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
        LGL.blit(target);
    }
}

export function step (dt, noiseSeed) {
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
    LGL.blit(noise.write);
    noise.swap();

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    LGL.blit(curl);
    
    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    LGL.blit(velocity.write);
    velocity.swap();
    
    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    LGL.blit(divergence);
    
    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    LGL.blit(pressure.write);
    pressure.swap();
    
    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        LGL.blit(pressure.write);
        pressure.swap();
    }
    
    gradientSubtractProgram.bind();
    gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    LGL.blit(velocity.write);
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
        LGL.blit(velocity.write);
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
        LGL.blit(dye.write);
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
    LGL.blit(velocity.write);
    velocity.swap();
    
    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
        gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
        gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
        LGL.blit(dye.write);
    dye.swap();
}

export function render (target, displayMaterial) {
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
            drawDisplay(target, displayMaterial);
        }
        else{
            drawDisplay(noise, displayMaterial);
        }
        // LGL.blit(picture);
    
    }
    
    export function correctDeltaX (delta) {
        let aspectRatio = canvas.width / canvas.height;
        if (aspectRatio < 1) delta *= aspectRatio;
        return delta;
    }
    
    export function correctDeltaY (delta) {
        let aspectRatio = canvas.width / canvas.height;
        if (aspectRatio > 1) delta /= aspectRatio;
        return delta;
    }

    export function correctRadius (radius) {
        let aspectRatio = canvas.width / canvas.height;
        if (aspectRatio > 1)
            radius *= aspectRatio;
        return radius;
    }
    export function drawColor (target, color) {
        colorProgram.bind();
        gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
        LGL.blit(target);
    }
    
    export function drawCheckerboard (target) {
        checkerboardProgram.bind();
        gl.uniform1f(checkerboardProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        LGL.blit(target);
    }

    export function normalizeColor (input) {
        let output = {
            r: input.r / 255,
            g: input.g / 255,
            b: input.b / 255
        };
        return output;
    }