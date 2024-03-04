#include <cassert>
#include <charconv>
#include <iostream>
#include <regex>
#include <string>
#include <string_view>
#include "value.hpp"

using namespace std::literals;

struct Token {
  enum class Type { SequenceStart, SequenceEnd, Number, String, Symbol };
  Type type{};
  std::string string;
};

auto tokenize(std::string_view str) {
  std::vector<Token> tokens;
  for (size_t i = 0; i < str.length();) {
    std::cmatch m;
    if (str[i] == '(' || str[i] == '{' || str[i] == '[') {
      tokens.push_back(Token{Token::Type::SequenceStart, std::string(1, str[i++])});
    } else if (str[i] == ')' || str[i] == '}' || str[i] == ']') {
      tokens.push_back(Token{Token::Type::SequenceEnd, std::string(1, str[i++])});
    } else if (std::regex_search(
      str.begin() + i, str.end(), m, std::regex("^\\d+"))
    ) {
      tokens.push_back(Token{Token::Type::Number, m[0]});
      i += m.length(0);
    } else if (std::regex_search(
      str.begin() + i, str.end(), m, std::regex(R"""(^"((\\.|[^"])*)")"""))
    ) {
      tokens.push_back(Token{
        Token::Type::String,
        std::regex_replace(std::string(m[1]), std::regex("\\\\(.)"), "$1")}
      );
      i += m.length(0);
    } else if (std::regex_search(
        str.begin() + i, str.end(), m,
        std::regex(R"""(^[A-Za-z_]\w*|^[!#-'*-/:-@^`|~]+)"""))
    ) {
      tokens.push_back(Token{Token::Type::Symbol, m[0]});
      i += m.length(0);
    } else ++i;
  }
  return tokens;
}

std::pair<size_t, Value> parseSequence(
  const std::vector<Token> &tokens, size_t i, std::string subtype = "("
);

std::pair<size_t, Value> parseExpr(
  const std::vector<Token> &tokens, size_t i
) {
  const auto &token = tokens.at(i);
  if (token.type == Token::Type::SequenceStart) {
    auto result = parseSequence(tokens, i + 1, token.string);
    assert(tokens[result.first].type == Token::Type::SequenceEnd);
    return {result.first + 1, result.second};
  }
  if (token.type == Token::Type::Number) {
    double num{};
    std::from_chars(
      token.string.data(),
      token.string.data() + token.string.size(), num
    );
    return {i + 1, Value::makeDic({{"type", "Number"}, {"value", num}})};
  }
  if (token.type == Token::Type::String) {
    return {i + 1, Value::makeDic({{"type", "String"}, {"value", token.string}})};
  }
  if (token.type == Token::Type::Symbol) {
    return {i + 1, Value::makeDic({{"type", "Symbol"}, {"value", token.string}})};
  }
  return {i, {}};
}

std::pair<size_t, Value> parseSequence(
  const std::vector<Token> &tokens, size_t i, std::string subtype
) {
  Value exprs;
  while (i < tokens.size() && tokens.at(i).type != Token::Type::SequenceEnd) {
    const auto result = parseExpr(tokens, i);
    i = result.first;
    exprs.push(result.second);
  }
  return {
    i, Value::makeDic({{"type", "Sequence"}, {"subtype", subtype}, {"exprs", exprs}})
  };
}

Value parse(const std::vector<Token> &tokens) {
  return parseSequence(tokens, 0).second;
}

Value evalExpr(Value env, Value expr);

Value callUserFunc(Value func, Value l, Value r) {
  auto env = Value::makeDic({
    {"__parentEnv", func["env"]},
    {"args", Value::makeDic({{"l", l}, {"r", r}})}
  });
  if (r.length() > 0) {
    auto argNames = func["argNames"];
    for (size_t i = 0; i < argNames.length(); ++i) {
      env[argNames[i]] = r[i];
    }
  } else {
    env[func["argNames"][0]] = r;
  }
  return evalExpr(env, func["expr"]);
}

Value callFunc(Value env, Value func, Value l, Value rExpr) {
  if (auto nativeFunc = func.asNativeFunc()) {
    return (*nativeFunc)(env, l, rExpr);
  }
  return callUserFunc(func, l, evalExpr(env, rExpr));
}

Value evalSequenceExpr(Value env, Value expr) {
  if (expr["exprs"].length() == 0) {
    if (expr["subtype"] == "[") return Value::makeArray();
    if (expr["subtype"] == "{") return Value::makeDic();
    return {};
  }
  auto val = evalExpr(env, expr["exprs"][0]);
  if (expr["subtype"] == "[") val = {{val}};
  for (size_t i = 1; i < expr["exprs"].length();) {
    auto func = evalExpr(env, expr["exprs"][i++]);
    auto rExpr = (
      i < expr["exprs"].length()
      ? expr["exprs"][i++]
      : Value::makeDic({{"type", "Null"}})
    );
    val = callFunc(env, func, val, rExpr);
  }
  if (expr["subtype"] == "{") {
    if (auto t = val.find("__type"); t && *t == "DicUnderConstruction") {
      val = val["body"];
    }
  }
  return val;
}

Value envVal(Value env, std::string_view name);

Value evalExpr(Value env, Value expr) {
  if (expr["type"] == "Sequence") return evalSequenceExpr(env, expr);
  if (expr["type"] == "Number") return expr["value"];
  if (expr["type"] == "String") return expr["value"];
  if (expr["type"] == "Symbol") return envVal(env, std::string(expr["value"]));
  return {};
}

Value ownerEnv(Value env, std::string_view name) {
  return (
    (env.isNull() || env.find(name))
    ? env : ownerEnv(env["__parentEnv"], name)
  );
}

Value envVal(Value env, std::string_view name) {
  return ownerEnv(env, name)[name];
}

Value createRootEnv() {
  Value rootEnv;
  static Value* rootEnvRef{};
  rootEnvRef = &rootEnv;
  rootEnv["@"] = Value{};
  rootEnv["//"] = Value::NativeFunc([](Value env, Value l, Value rExpr) { return l; });
  rootEnv[";"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return evalExpr(env, rExpr);
  });
  rootEnv["+"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return l + evalExpr(env, rExpr);
  });
  rootEnv["-"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(double(l) - double(evalExpr(env, rExpr)));
  });
  rootEnv["*"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(double(l) * double(evalExpr(env, rExpr)));
  });
  rootEnv["=="] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(l == evalExpr(env, rExpr));
  });
  rootEnv["!="] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(l != evalExpr(env, rExpr));
  });
  rootEnv["<"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(l < evalExpr(env, rExpr));
  });
  rootEnv["<="] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(l <= evalExpr(env, rExpr));
  });
  rootEnv[">"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(l > evalExpr(env, rExpr));
  });
  rootEnv[">="] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(l >= evalExpr(env, rExpr));
  });
  rootEnv["var"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    auto name = evalExpr(env, rExpr);
    env[name] = Value{};
    return name;
  });
  rootEnv["="] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    if (l.length() == 2) {
      auto obj = l[0], key = l[1];
      return obj[key] = evalExpr(env, rExpr);
    }
    auto name = std::string(l);
    auto e = ownerEnv(env, name);
    if (e.isNull()) e = *rootEnvRef;
    return e[name] = evalExpr(env, rExpr);
  });
  rootEnv["."] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return l[(rExpr["type"] == "Symbol" ? rExpr["value"] : evalExpr(env, rExpr))];
  });
  rootEnv[","] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    if (auto t = l.find("__type"); t && *t == "DicUnderConstruction") {
      auto v = l.shallowCopy();
      v["tmpKey"] = evalExpr(env, rExpr);
      return v;
    }
    if (l.length() > 0) {
      auto v = l.shallowCopy();
      v.push(evalExpr(env, rExpr));
      return v;
    }
    return Value{l, evalExpr(env,rExpr)};
  });
  rootEnv["&&"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(l && evalExpr(env, rExpr));
  });
  rootEnv["||"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(l || evalExpr(env, rExpr));
  });
  rootEnv["?"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value::makeDic({{"__type", "IfThenResult"}, {"isTrue", l}, {"exprIfTrue", rExpr}});
  });
  rootEnv[":"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    if (auto t = l.find("__type"); t && *t == "IfThenResult") {
      return evalExpr(env, l["isTrue"] ? l["exprIfTrue"] : rExpr);
    }
    if (auto s = l.asString()) {
      return Value::makeDic({
        {"__type", "DicUnderConstruction"},
        {"body", Value::makeDic({{*s, evalExpr(env,rExpr)}})}
      });
    }
    if (auto t = l.find("__type"); t && *t == "DicUnderConstruction") {
      auto v = l.shallowCopy();
      v["body"] = l["body"].shallowCopy();
      v["body"][l["tmpKey"]] = evalExpr(env, rExpr);
      return v;
    }
    return Value{};
  });
  rootEnv["=>"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value::makeDic({
      {"env", env},
      {"argNames", l.length() > 0 ? l : Value{{l}}},
      {"expr", rExpr}
    });
  });
  rootEnv["range"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    Value v;
    for (size_t i = 0; i < size_t(evalExpr(env, rExpr)); ++i) {
      v.push({static_cast<double>(i)});
    }
    return v;
  });
  rootEnv["length"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    return Value(double(l.length()));
  });
  rootEnv["map"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    Value v;
    auto func = evalExpr(env, rExpr);
    for (size_t i = 0; i < l.length(); ++i) {
      v.push(callUserFunc(func, Value{}, l[i]));
    }
    return v;
  });
  rootEnv["forEach"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    auto func = evalExpr(env, rExpr);
    for (size_t i = 0; i < l.length(); ++i) {
      callUserFunc(func, Value{}, l[i]);
    }
    return Value{};
  });
  rootEnv["print"] = Value::NativeFunc([](Value env, Value l, Value rExpr) {
    std::cout << std::string(evalExpr(env, rExpr)) << std::endl;
    return Value{};
  });
  return rootEnv;
}

Value evalCode(std::string_view str) {
  const auto tokens = tokenize(str);
  auto expr = Value{parse(tokens)};
  return evalExpr(createRootEnv(), expr);
}
