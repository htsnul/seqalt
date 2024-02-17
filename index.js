import { evalCode } from "./seqalt.js"

onload = async () => {
  document.body.innerHTML = `
    <style>
      .samples {
        display: block;
        position: absolute;
        background: white;
        border: 1px solid #ccc;
      }
    </style>
    <h1>seqalt playground</h1>
    <details>
      <summary>Samples</summary>
      <table class="samples"></table>
    </details>
    <div><textarea style="width: 80em; height: 25em;"></textarea></div>
    <div><button class="eval-code">eval</button></div>
    <h4>Log:</h4>
    <pre class="log"></pre>
    <h4>Result:</h4>
    <pre class="result"></pre>
  `;
  {
    const codesStr = await (await fetch("samples.txt")).text();
    const strs = codesStr.split("####").map((str) => str.trim()).slice(1);
    const codes = [];
    for (let i = 0; i < strs.length; i += 2) {
      codes.push({ title: strs[i], body: strs[i + 1] });
    }
    codes.forEach((code) => {
      const e = document.createElement("tr");
      e.innerHTML = `<td><button>${code.title}</button></td>`;
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
