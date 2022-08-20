import { evalCode } from "./binop.js"

const code0 = `
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
`;

const code1 = `
i = 0;
ary = (
  (() => (()print(4))),
  (() => (()print(5)))
);
()(()$ary.0)();
`;

const code2 = `
()print((3 + 10) - (8 + 4 + 2));
()print(3);
()print(3 == 3);
`;

const code3 = `
0 && (()print(10));
1 && (()print(11));
1 && (
  ()print(12);
);
`;

const code4 = `
a = 5;
()print(()$a);
a = (()$a + 3);
()print(()$a);
`;

const code5 = `
fn = (() => (
  ()print(()$args.0);
  ()print(()$args.1);
));
(1)fn(2);
(3)fn(4);
`;

const code6 = `
()print(0 ? 3 : 4);
()print(0 && 3 || 4);
()print(1 ? 3 : 4);
()print(1 && 3 || 4);
()print(0 ? 0 : 5);
()print(0 && 0 || 5);
()print(1 ? 0 : 5);
()print(1 && 0 || 5);
`;

const code7 = `
fib = (() => (
  ((()$args.1) < 2) ? (
    ()$args.1
  ) : (
    (()fib(()$args.1 - 1)) +
    (()fib(()$args.1 - 2))
  )
));
()fib(9)
`;

const code8 = `
a = ((b: 3) + (c: 4));
()$a, b = 2;
()print(()$a.b);
()print(()$a.c);
`;

const code9 = `
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
    <div></div>
    <div><textarea style="width: 80em; height: 25em;"></textarea></div>
    <div><button>evalCode</button></div>
    <pre class="log"></pre>
    <pre class="result"></pre>
  `;
  document.querySelector("textarea").value = code9;
  globalThis.log = (str) => {
    document.querySelector(".log").innerHTML += str + "\n";
  };
  document.querySelector("button").onclick = () => {
    document.querySelector(".log").innerHTML = "";
    document.querySelector(".result").innerHTML = "";
    const code = document.querySelector("textarea").value;
    const result = evalCode(code);
    document.querySelector(".result").innerHTML += result;
  };
};
