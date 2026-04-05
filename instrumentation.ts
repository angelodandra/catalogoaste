/**
 * Next.js instrumentation — runs once before the server starts.
 * We polyfill DOM APIs that pdfjs-dist needs at module-evaluation time
 * (canvas.js does `new DOMMatrix()` when the module first loads).
 * Without these stubs the import throws in Node.js environments.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const g = globalThis as Record<string, unknown>;

    if (!g["DOMMatrix"]) {
      function FakeDOMMatrix(this: Record<string, unknown>) {
        this["a"]=1;this["b"]=0;this["c"]=0;this["d"]=1;this["e"]=0;this["f"]=0;
        this["m11"]=1;this["m12"]=0;this["m13"]=0;this["m14"]=0;
        this["m21"]=0;this["m22"]=1;this["m23"]=0;this["m24"]=0;
        this["m31"]=0;this["m32"]=0;this["m33"]=1;this["m34"]=0;
        this["m41"]=0;this["m42"]=0;this["m43"]=0;this["m44"]=1;
        this["is2D"]=true;this["isIdentity"]=true;
      }
      const proto = FakeDOMMatrix.prototype as Record<string, unknown>;
      proto["scale"]     = function() { return new (FakeDOMMatrix as any)(); };
      proto["translate"] = function() { return new (FakeDOMMatrix as any)(); };
      proto["multiply"]  = function() { return new (FakeDOMMatrix as any)(); };
      proto["inverse"]   = function() { return new (FakeDOMMatrix as any)(); };
      proto["transformPoint"] = function(p: any) { return p ?? { x:0, y:0 }; };
      g["DOMMatrix"] = FakeDOMMatrix;
    }

    if (!g["ImageData"]) {
      g["ImageData"] = class {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(w: number | Uint8ClampedArray, h: number, dh?: number) {
          if (typeof w === "number") {
            this.width = w; this.height = h;
            this.data = new Uint8ClampedArray(w * h * 4);
          } else {
            this.data = w; this.width = h; this.height = dh ?? 0;
          }
        }
      };
    }

    if (!g["Path2D"]) {
      g["Path2D"] = class {
        constructor(_d?: unknown) {}
        moveTo()  {}
        lineTo()  {}
        arc()     {}
        rect()    {}
        closePath() {}
        addPath() {}
      };
    }
  }
}
