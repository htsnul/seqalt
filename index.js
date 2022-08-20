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

onload = () => {
  document.body.innerHTML = `
    <div></div>
    <div><textarea style="width: 80em; height: 25em;"></textarea></div>
    <div><button>evalCode</button></div>
    <pre class="log"></pre>
    <pre class="result"></pre>
  `;
  document.querySelector("textarea").value = code0;
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
