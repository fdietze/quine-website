/**
 * One open world, as JavaScript sees it.
 */
export class QuineWorld {
    static __wrap(ptr) {
        const obj = Object.create(QuineWorld.prototype);
        obj.__wbg_ptr = ptr;
        QuineWorldFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        QuineWorldFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_quineworld_free(ptr, 0);
    }
    /**
     * Browser focus left the shell: cancel keyboard state just as the window
     * shell does. Contact cancellation is page policy (it owns pointer ids);
     * this message is the core's one keyboard lifecycle edge.
     */
    blur() {
        wasm.quineworld_blur(this.__wbg_ptr);
    }
    /**
     * Close the world: its last boundary goes down and the container is
     * closed. A page must not RELY on reaching this - browsers do not promise
     * unload callbacks - which is why every non-tick boundary already wrote
     * itself down.
     */
    close() {
        const ptr = this.__destroy_into_raw();
        wasm.quineworld_close(ptr);
    }
    /**
     * Evaluate at the CONTROL boundary - the operator's own door, the same one
     * `eval.sock` and `--eval` use. The reply arrives at the page's callback
     * as `{type:"eval", id, text}` on a later pump, because the form may park.
     * @param {number} id
     * @param {string} src
     */
    eval(id, src) {
        const ptr0 = passStringToWasm0(src, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.quineworld_eval(this.__wbg_ptr, id, ptr0, len0);
    }
    /**
     * The free cursor, which is not a contact: hover tracks id-bearing click
     * targets and clears on leave.
     * @param {number} x
     * @param {number} y
     */
    hover(x, y) {
        wasm.quineworld_hover(this.__wbg_ptr, x, y);
    }
    /**
     * One key transition. `name` is the key's name - the same fact every
     * other shell reports, so `keys-held` behaves identically.
     * @param {boolean} down
     * @param {boolean} repeat
     * @param {string} name
     * @param {boolean} logo
     */
    key(down, repeat, name, logo) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.quineworld_key(this.__wbg_ptr, down, repeat, ptr0, len0, logo);
    }
    /**
     * What the person calls this world (its catalog name), for the page's
     * title.
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.quineworld_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * One pointer transition, in the canvas's own logical coordinates. The
     * browser's `pointerId` is the platform id; the core mints the contact
     * identity the image sees (it never reuses one, a platform does).
     * @param {number} pointer_id
     * @param {string} phase
     * @param {number} x
     * @param {number} y
     */
    pointer(pointer_id, phase, x, y) {
        const ptr0 = passStringToWasm0(phase, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.quineworld_pointer(this.__wbg_ptr, pointer_id, ptr0, len0, x, y);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * ONE TURN, then the answer the page schedules on: milliseconds until the
     * world next needs the CPU, `0` for "again immediately", `-1` for
     * "nothing is due - wait for an event".
     * @returns {number}
     */
    pump() {
        const ret = wasm.quineworld_pump(this.__wbg_ptr);
        return ret;
    }
    /**
     * Re-derive the status line now. Its phase age reads the live clock, so
     * the page asks about once a second while it is visible (a hidden tab's
     * timers are throttled, so a quiet world in the background stays quiet);
     * an unchanged line posts nothing.
     */
    refresh_status() {
        wasm.quineworld_refresh_status(this.__wbg_ptr);
    }
    /**
     * The canvas's box changed (a window resize, a rotation, a
     * `devicePixelRatio` change). The image hears the geometry it is laid out
     * in, in logical units, with the device-pixels-per-unit beside it.
     * @param {number} width
     * @param {number} height
     * @param {number} scale
     */
    resize(width, height, scale) {
        wasm.quineworld_resize(this.__wbg_ptr, width, height, scale);
    }
    /**
     * A human turn to the resident agent - the chat input's one job.
     * @param {string} text
     */
    say(text) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.quineworld_say(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Attach this world's OpenRouter resident. The key stays in host memory:
     * it is captured by the provider transport and never enters Expr, Chat,
     * the world store, diagnostics or fixtures. Calling twice is refused - a
     * session has one resident identity and one accounting authority.
     * @param {string} api_key
     * @param {string} model
     * @param {string} effort
     */
    start_resident(api_key, model, effort) {
        const ptr0 = passStringToWasm0(api_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(model, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(effort, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.quineworld_start_resident(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Has the world stopped (a shell shutdown)? The page then stops pumping
     * and calls `close`.
     * @returns {boolean}
     */
    stopped() {
        const ret = wasm.quineworld_stopped(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Search-use lower bound from this world's accounting authority:
     * provider request count or typed search result when that count is absent.
     * A fetch is not a search.
     * @returns {number}
     */
    web_search_requests() {
        const ret = wasm.quineworld_web_search_requests(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * One wheel step at the canvas-logical cursor. `dy` is already in the
     * core's convention - logical pixels, POSITIVE = toward the top of the
     * content (winit's sign; the stdlib scrollable subtracts it from its
     * offset) - because only the page knows the DOM's delta mode and sign.
     * @param {number} x
     * @param {number} y
     * @param {number} dy
     */
    wheel(x, y, dy) {
        wasm.quineworld_wheel(this.__wbg_ptr, x, y, dy);
    }
}
if (Symbol.dispose) QuineWorld.prototype[Symbol.dispose] = QuineWorld.prototype.free;

/**
 * Make a new world named `name`; answers its id.
 * @param {string} name
 * @returns {Promise<string>}
 */
export function catalog_create(name) {
    const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.catalog_create(ptr0, len0);
    return ret;
}

/**
 * Delete a closed world; refused while it is open in another tab.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function catalog_delete(id) {
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.catalog_delete(ptr0, len0);
    return ret;
}

/**
 * The bytes of a closed world's file, for the page to download.
 * @param {string} id
 * @returns {Promise<Uint8Array>}
 */
export function catalog_export(id) {
    const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.catalog_export(ptr0, len0);
    return ret;
}

/**
 * THE LAUNCHER'S CATALOG, as seen from a page: every world, most recently
 * opened first, as `[{id, name}]`. Runs in a Worker because the catalog's
 * writes need synchronous access handles (crate::catalog).
 * @returns {Promise<Array<any>>}
 */
export function catalog_list() {
    const ret = wasm.catalog_list();
    return ret;
}

/**
 * Give this process a font face, BEFORE any world opens.
 *
 * A browser discovers no fonts, and the very first thing a world does is
 * paint its boot view - so a face installed after `open_world` arrives too
 * late and shaping panics with no default font, exactly as it did on Android
 * before `/system/fonts` was loaded. Hence a free function rather than a
 * method: there is nothing to hang it on yet, which is the point.
 * @param {Uint8Array} bytes
 */
export function install_font(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.install_font(ptr0, len0);
}

/**
 * Open a world, or refuse.
 *
 * ASYNC EXACTLY ONCE, and this is the place: installing the OPFS pool is the
 * browser's only asynchronous step, and everything after it - the store, the
 * image, every boundary - is the synchronous code every other shell runs.
 * A pool that will not install returns an error here, so a world whose pages
 * have nowhere to live never opens (no in-RAM fallback, by construction).
 *
 * ONE WORLD PER WORKER is the browser shell's PRODUCT POLICY, enforced here
 * rather than assumed: the page closes a world by flushing it and
 * TERMINATING its Worker, and opens the next world in a fresh one. That
 * makes teardown total - a terminated Worker leaves no wasm instance, no
 * registered VFS and no process-global state (device singletons, the time
 * sampler's publisher, attachment sets, interface outboxes) that the next
 * world could inherit - so no Worker-level static ever has to be reasoned
 * about as shared between two worlds. A page that tries anyway is told so.
 * @param {string} world_id
 * @param {number} width
 * @param {number} height
 * @param {number} scale
 * @param {Function} emit
 * @returns {Promise<QuineWorld>}
 */
export function open_world(world_id, width, height, scale, emit) {
    const ptr0 = passStringToWasm0(world_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.open_world(ptr0, len0, width, height, scale, emit);
    return ret;
}

/**
 * WHAT THE SETTINGS SCREEN OFFERS, from the one authority (src/llm.rs): the
 * default model's name (the placeholder of an empty box), the default effort
 * and the whole ladder, lowest to highest - enumerated from the type, so a
 * rung added there appears here instead of being silently missing.
 * @returns {object}
 */
export function resident_defaults() {
    const ret = wasm.resident_defaults();
    return ret;
}

/**
 * Runs once when the module is instantiated, before any export is called: a
 * Rust panic in ANY entry point (catalog or world) then reaches the Worker's
 * console as its message instead of a bare `unreachable`.
 */
export function start() {
    wasm.start();
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_boolean_get_c9c83ebd41b34df3: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_a57024b9c6e4a48b: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_5e4570eb24ffa122: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_7d13f41e1a2d5140: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_a2790eb24c211ea0: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_undefined_6cff064c44e0d823: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_string_get_d154f1e671052120: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_be22cc64ae6946a0: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_append_acad6a3f39a3e778: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_buffer_78291c0e094ccf99: function(arg0) {
            const ret = arg0.buffer;
            return ret;
        },
        __wbg_byteLength_336bc7d303511ba0: function(arg0) {
            const ret = arg0.byteLength;
            return ret;
        },
        __wbg_byteOffset_2b1d5b10453ce198: function(arg0) {
            const ret = arg0.byteOffset;
            return ret;
        },
        __wbg_call_1c5886ab9c57d1c7: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_35dba3c747ad7521: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_39f824e18d9d2414: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            const ret = arg0.call(arg1, arg2, arg3, arg4);
            return ret;
        }, arguments); },
        __wbg_close_cffebe146c546247: function(arg0) {
            arg0.close();
        },
        __wbg_createSyncAccessHandle_e383ed6b08d0e3ee: function(arg0) {
            const ret = arg0.createSyncAccessHandle();
            return ret;
        },
        __wbg_done_669171204c3dcae2: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_90a6ca372c867900: function(arg0) {
            const ret = arg0.entries();
            return ret;
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_fetch_d752d93f5b259503: function(arg0, arg1) {
            const ret = arg0.fetch(arg1);
            return ret;
        },
        __wbg_fill_36c70ae56a83e4f3: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.fill(arg1, arg2 >>> 0, arg3 >>> 0);
            return ret;
        },
        __wbg_flush_fc67ba80dfb8083f: function() { return handleError(function (arg0) {
            arg0.flush();
        }, arguments); },
        __wbg_getDate_b0ac858991e80b2e: function(arg0) {
            const ret = arg0.getDate();
            return ret;
        },
        __wbg_getDay_d65e35285ba489ae: function(arg0) {
            const ret = arg0.getDay();
            return ret;
        },
        __wbg_getDirectoryHandle_3b6e6ec9cd618b74: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.getDirectoryHandle(getStringFromWasm0(arg1, arg2), arg3);
            return ret;
        },
        __wbg_getDirectory_2cc7169b6007ef84: function(arg0) {
            const ret = arg0.getDirectory();
            return ret;
        },
        __wbg_getFileHandle_275e470e839818da: function(arg0, arg1, arg2) {
            const ret = arg0.getFileHandle(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_getFileHandle_ba98be7045eab758: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.getFileHandle(getStringFromWasm0(arg1, arg2), arg3);
            return ret;
        },
        __wbg_getFile_f042da3b150a3230: function(arg0) {
            const ret = arg0.getFile();
            return ret;
        },
        __wbg_getFullYear_d2ecaf3ecbfaddf9: function(arg0) {
            const ret = arg0.getFullYear();
            return ret;
        },
        __wbg_getHours_521ab343a38cb962: function(arg0) {
            const ret = arg0.getHours();
            return ret;
        },
        __wbg_getMinutes_27257e5640ea2e7c: function(arg0) {
            const ret = arg0.getMinutes();
            return ret;
        },
        __wbg_getMonth_9f2f20dab3150834: function(arg0) {
            const ret = arg0.getMonth();
            return ret;
        },
        __wbg_getRandomValues_2d48c3a8129da8fd: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_896855b3a5f89999: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getSeconds_0071b90906b363f2: function(arg0) {
            const ret = arg0.getSeconds();
            return ret;
        },
        __wbg_getSize_b36240c52be725fe: function() { return handleError(function (arg0) {
            const ret = arg0.getSize();
            return ret;
        }, arguments); },
        __wbg_getTime_63fb0332e6c4ec17: function(arg0) {
            const ret = arg0.getTime();
            return ret;
        },
        __wbg_getTimezoneOffset_4baa793e0d3962a8: function(arg0) {
            const ret = arg0.getTimezoneOffset();
            return ret;
        },
        __wbg_getUint32_1cfbc1285192d4d4: function(arg0, arg1) {
            const ret = arg0.getUint32(arg1 >>> 0);
            return ret;
        },
        __wbg_get_971a0c45d172643f: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_c0c8f8d7da0c03dd: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_d173c0308df22d37: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_index_692b103434df899b: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_headers_6dedf39f001ae99d: function(arg0) {
            const ret = arg0.headers;
            return ret;
        },
        __wbg_headers_92567b07014384b9: function(arg0) {
            const ret = arg0.headers;
            return ret;
        },
        __wbg_instanceof_DedicatedWorkerGlobalScope_bd193eb4ec0d4971: function(arg0) {
            let result;
            try {
                result = arg0 instanceof DedicatedWorkerGlobalScope;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Error_61d8a02a0f3383a1: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Error;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Promise_e6e764b945c3128a: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Promise;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_8f49efbd4bfd76d6: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_WorkerGlobalScope_8c58a6d74926b578: function(arg0) {
            let result;
            try {
                result = arg0 instanceof WorkerGlobalScope;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_6339f732981044bf: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_iterator_5cebbb86e33c6dd6: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_36bd29c6848c2144: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_message_c141d5e68716b595: function(arg0) {
            const ret = arg0.message;
            return ret;
        },
        __wbg_navigator_e5c345298a9609cd: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_new_0_f117d868b403dc07: function() {
            const ret = new Date();
            return ret;
        },
        __wbg_new_116be93542d39019: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_13a20857fcf78d7a: function(arg0, arg1, arg2) {
            const ret = new DataView(arg0, arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_358857d90afd5a2d: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_418fb92a013d5930: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_442b3569720a6819___convert__closures_____invoke___js_sys_33c619686b781a0d___Function_fn_wasm_bindgen_442b3569720a6819___JsValue_____wasm_bindgen_442b3569720a6819___sys__Undefined___js_sys_33c619686b781a0d___Function_fn_wasm_bindgen_442b3569720a6819___JsValue_____wasm_bindgen_442b3569720a6819___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_95039e162b0c4466: function() { return handleError(function () {
            const ret = new Headers();
            return ret;
        }, arguments); },
        __wbg_new_ebe3e0f6837f0879: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_f9d6489212f3b2b3: function(arg0) {
            const ret = new Date(arg0);
            return ret;
        },
        __wbg_new_from_slice_3eea173078478cfe: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_cceaf62d8d95e9f2: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_442b3569720a6819___convert__closures_____invoke___js_sys_33c619686b781a0d___Function_fn_wasm_bindgen_442b3569720a6819___JsValue_____wasm_bindgen_442b3569720a6819___sys__Undefined___js_sys_33c619686b781a0d___Function_fn_wasm_bindgen_442b3569720a6819___JsValue_____wasm_bindgen_442b3569720a6819___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_length_3ffc1c56427c525c: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_new_with_str_and_init_5a37d576dec75a86: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_new_with_year_month_day_cc812ef210488bf4: function(arg0, arg1, arg2) {
            const ret = new Date(arg0 >>> 0, arg1, arg2);
            return ret;
        },
        __wbg_next_42cf16ee0dafc9e2: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_next_8f26b64fa5e9f64b: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_ae072aa8ecb396cb: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_now_8b265300afd5f2b9: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_performance_3fcf6e32a7e1ed0a: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_prototypesetcall_de8e0d9553586985: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_adb0107829f02d75: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_queueMicrotask_ac694eae12e92dfb: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_queueMicrotask_be5fe34a8f4cad4d: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_quineworld_new: function(arg0) {
            const ret = QuineWorld.__wrap(arg0);
            return ret;
        },
        __wbg_random_b0d98802be10ff20: function() {
            const ret = Math.random();
            return ret;
        },
        __wbg_read_ab19cfc151f4bfb2: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.read(getArrayU8FromWasm0(arg1, arg2), arg3);
            return ret;
        }, arguments); },
        __wbg_read_d33c5395752d9c02: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.read(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_removeEntry_7f9746325badb0a2: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.removeEntry(getStringFromWasm0(arg1, arg2), arg3);
            return ret;
        },
        __wbg_resolve_020f95d838c6ef25: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_setTimeout_eb1cd7bff8dee2a7: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.setTimeout(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_setUint32_6e4c7e967587027b: function(arg0, arg1, arg2) {
            arg0.setUint32(arg1 >>> 0, arg2 >>> 0);
        },
        __wbg_set_8155bb79a948541b: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_at_6f40905f0edc79cf: function(arg0, arg1) {
            arg0.at = arg1;
        },
        __wbg_set_b9b5b5cb7b495037: function(arg0, arg1, arg2) {
            arg0.set(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_set_body_f301b68bff45f419: function(arg0, arg1) {
            arg0.body = arg1;
        },
        __wbg_set_create_7df81b728041e33b: function(arg0, arg1) {
            arg0.create = arg1 !== 0;
        },
        __wbg_set_create_c415df73c1fec0ca: function(arg0, arg1) {
            arg0.create = arg1 !== 0;
        },
        __wbg_set_credentials_d7f3b810cbf191e1: function(arg0, arg1) {
            arg0.credentials = __wbindgen_enum_RequestCredentials[arg1];
        },
        __wbg_set_e92392c4b44c5de1: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.set(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_set_headers_805555608daf7f2a: function(arg0, arg1) {
            arg0.headers = arg1;
        },
        __wbg_set_method_cf2b992b9a610bc3: function(arg0, arg1, arg2) {
            arg0.method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_mode_d6479dfd6696c8d3: function(arg0, arg1) {
            arg0.mode = __wbindgen_enum_RequestMode[arg1];
        },
        __wbg_set_recursive_e309856cfc92a556: function(arg0, arg1) {
            arg0.recursive = arg1 !== 0;
        },
        __wbg_set_redirect_9d53fb52143d8ea4: function(arg0, arg1) {
            arg0.redirect = __wbindgen_enum_RequestRedirect[arg1];
        },
        __wbg_set_signal_115b9e9423652e66: function(arg0, arg1) {
            arg0.signal = arg1;
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_THIS_466428f93b4eaa76: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_c7aea38d4de089bc: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_42d4fae05e59267a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_e0db14a0eba6a812: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_status_b0de02a07fd7d927: function(arg0) {
            const ret = arg0.status;
            return ret;
        },
        __wbg_storage_8404e6f1c45baa97: function(arg0) {
            const ret = arg0.storage;
            return ret;
        },
        __wbg_subarray_a4cc58201c7359fd: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_text_4e32202a84cb608d: function(arg0) {
            const ret = arg0.text();
            return ret;
        },
        __wbg_text_9302f33ea8cfce7b: function() { return handleError(function (arg0) {
            const ret = arg0.text();
            return ret;
        }, arguments); },
        __wbg_then_7026b513a94278a8: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_then_72819b8d4e081fb5: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_timeout_e42525a949868363: function(arg0) {
            const ret = AbortSignal.timeout(arg0);
            return ret;
        },
        __wbg_truncate_33e88a08aec84901: function() { return handleError(function (arg0, arg1) {
            arg0.truncate(arg1);
        }, arguments); },
        __wbg_truncate_d9bc4541b2289295: function() { return handleError(function (arg0, arg1) {
            arg0.truncate(arg1 >>> 0);
        }, arguments); },
        __wbg_value_1e2369fab29b420e: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_write_c418a353f008965f: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.write(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_write_cab998b888a6fc03: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.write(getArrayU8FromWasm0(arg1, arg2), arg3);
            return ret;
        }, arguments); },
        __wbg_write_e94e28d81cffe549: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.write(getArrayU8FromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 142, ret: NamedExternref("Promise<any>"), inner_ret: Some(NamedExternref("Promise<any>")) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_442b3569720a6819___convert__closures_____invoke___wasm_bindgen_442b3569720a6819___JsValue__js_sys_33c619686b781a0d___Promise__true_);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 2297, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_442b3569720a6819___convert__closures_____invoke___wasm_bindgen_442b3569720a6819___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_442b3569720a6819___JsError___true_);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./quine_browser_bg.js": import0,
    };
}

function wasm_bindgen_442b3569720a6819___convert__closures_____invoke___wasm_bindgen_442b3569720a6819___JsValue__js_sys_33c619686b781a0d___Promise__true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_442b3569720a6819___convert__closures_____invoke___wasm_bindgen_442b3569720a6819___JsValue__js_sys_33c619686b781a0d___Promise__true_(arg0, arg1, arg2);
    return ret;
}

function wasm_bindgen_442b3569720a6819___convert__closures_____invoke___wasm_bindgen_442b3569720a6819___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_442b3569720a6819___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_442b3569720a6819___convert__closures_____invoke___wasm_bindgen_442b3569720a6819___JsValue__core_9b3796e30d99ddb7___result__Result_____wasm_bindgen_442b3569720a6819___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_442b3569720a6819___convert__closures_____invoke___js_sys_33c619686b781a0d___Function_fn_wasm_bindgen_442b3569720a6819___JsValue_____wasm_bindgen_442b3569720a6819___sys__Undefined___js_sys_33c619686b781a0d___Function_fn_wasm_bindgen_442b3569720a6819___JsValue_____wasm_bindgen_442b3569720a6819___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_442b3569720a6819___convert__closures_____invoke___js_sys_33c619686b781a0d___Function_fn_wasm_bindgen_442b3569720a6819___JsValue_____wasm_bindgen_442b3569720a6819___sys__Undefined___js_sys_33c619686b781a0d___Function_fn_wasm_bindgen_442b3569720a6819___JsValue_____wasm_bindgen_442b3569720a6819___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];


const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];


const __wbindgen_enum_RequestRedirect = ["follow", "error", "manual"];
const QuineWorldFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_quineworld_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('quine_browser_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
