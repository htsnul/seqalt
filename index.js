import { evalCode } from "./binop.js"

const codesStr = `

#### Lambda args ####

then = (() => (
  i = 0;
  ()$args.0 || (i = 1);
  ()(()$args.1.(()$i))();
));
0 then((() => (
  ()print(aaa);
)), (() => (
  ()print(bbb);
)));

#### Lambda array ####

i = 0;
ary = (
  (() => (()print(4))),
  (() => (()print(5)))
);
()(()$ary.0)();

#### Arithmetic ####

()print((3 + 10) - (8 + 4 + 2));

#### Condtions ####

0 && (()print(10));
1 && (()print(11));
1 && (
  ()print(12);
);

#### Variable ####

a = 5;
()print(()$a);
a = (()$a + 3);
()print(()$a);

#### User function ####

fn = (() => (
  ()print(()$args.0);
  ()print(()$args.1);
));

(1)fn(2);
(3)fn(4);

#### Ternary operator ####

()print(0 && 3 || 4);
()print(0 ? 3 : 4);
()print(1 && 3 || 4);
()print(1 ? 3 : 4);
()print(0 && 0 || 5);
()print(0 ? 0 : 5);
()print(1 && 0 || 5);
()print(1 ? 0 : 5);

#### Fibonacci ####

fib = (() => (
  ((()$args.1) < 2) ? (
    ()$args.1
  ) : (
    (()fib(()$args.1 - 1)) +
    (()fib(()$args.1 - 2))
  )
));
()fib(9)

#### Dictionary ####

a = ((b: 3) + (c: 4));
()$a, b = 2;
()print(()$a.b);
()print(()$a.c);

#### Scope ####

()print(a);
()var a = 1;
()(() => (
  ()print(()$a);
  a = 4;
  ()print(()$a);
))();
()print(()$a);

()print(b);
()var b = 1;
()(() => (
  ()print(()$b);
  ()var b = 4;
  ()print(()$b);
))();
()print(()$b);
`;

onload = () => {
  document.body.innerHTML = `
    <style>
      .samples {
        position: absolute;
        background: white;
        border: 1px solid #ccc;
      }
      .samples button {
        width: 100%;
      }
    </style>
    <details>
      <summary>Samples</summary>
      <div class="samples" style="position: absolute; background: white; border: 1px solid #ccc;">
      </div>
    </details>
    <div><textarea style="width: 80em; height: 25em;"></textarea></div>
    <div><button class="eval-code">evalCode</button></div>
    <h4>Log:</h4>
    <pre class="log"></pre>
    <h4>Result:</h4>
    <pre class="result"></pre>
  `;
  {
    const strs = codesStr.split("####").map((str) => str.trim()).slice(1);
    const codes = [];
    for (let i = 0; i < strs.length; i += 2) {
      codes.push({ title: strs[i], body: strs[i + 1] });
    }
    codes.forEach((code) => {
      const e = document.createElement("div");
      e.innerHTML = `<button>${code.title}</button>`;
      e.querySelector("button").onclick = () => {
        document.querySelector("textarea").value = code.body;
        document.querySelector("details").open = null;
      };
      document.querySelector(".samples").appendChild(e);
    });
  }
  globalThis.log = (str) => {
    document.querySelector(".log").innerHTML += str + "\n";
  };
  document.querySelector(".eval-code").onclick = () => {
    document.querySelector(".log").innerHTML = "";
    document.querySelector(".result").innerHTML = "";
    const code = document.querySelector("textarea").value;
    const result = evalCode(code);
    document.querySelector(".result").innerHTML += result;
  };
};
