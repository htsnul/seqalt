#include <cassert>
#include <charconv>
#include <forward_list>
#include <string>
#include <string_view>
#include <unordered_map>
#include <variant>
#include <vector>

using namespace std::literals;

struct DynamicValue;

inline struct GarbageCollector {
  std::forward_list<DynamicValue *> values;
} garbageCollector;

struct Value;

using Array = std::vector<Value>;
using Dic = std::unordered_map<std::string, Value>;
using NativeFunction = Value (*)(Value env, Value l, Value rExr);

struct Value {
  using Body = std::variant<
    std::nullptr_t,
    double,
    NativeFunction,
    DynamicValue*
  >;
  Body body;
  Value() {}
  Value(const Body& body) { this->body = body; }
  inline Value(std::string_view str);
  Value& operator=(const Body& body) { this->body = body; return *this; }
  NativeFunction* asNativeFunction() { return std::get_if<NativeFunction>(&body); }
  DynamicValue** asDynamicValue() { return std::get_if<DynamicValue*>(&body); }
  inline double toNumber();
  inline std::string toString();
  inline operator std::string_view();
  inline size_t length();
  inline Value& operator[](size_t i);
  inline Value& operator[](std::string_view s);
};

struct DynamicValue {
  using Body = std::variant<
    std::string,
    Array,
    Dic
  >;
  Body body;
  DynamicValue() { garbageCollector.values.push_front(this); }
  DynamicValue(const DynamicValue& val) : DynamicValue(val.body) {}
  DynamicValue(const Body& body) : DynamicValue() { this->body = body; }
  DynamicValue(std::initializer_list<Dic::value_type> list) : DynamicValue(Dic(list)) {}
  operator std::string_view() { return std::get<std::string>(body); }
  Array &asArray() { return std::get<Array>(body); }
  Dic &asDic() { return std::get<Dic>(body); }
  Value& operator[](std::string_view str) {
    return asDic()[std::string(str)];
  }
  Value& operator[](size_t i) { return asArray().at(i); }
  size_t length() { return asArray().size(); }
  std::string toString() {
    if (std::holds_alternative<std::string>(body)) {
      return std::get<std::string>(body);
    }
    if (std::holds_alternative<Array>(body)) {
      auto &array = std::get<Array>(body);
      std::string s{};
      size_t i{0};
      s += "[";
      for (auto &e : array) {
        s += e.toString() + (i != array.size() - 1 ? "," : "");
        ++i;
      }
      s += "]";
      return s;
    }
    if (std::holds_alternative<Dic>(body)) {
      auto &dic = std::get<Dic>(body);
      std::string s{};
      size_t i{0};
      s += "{";
      for (auto &[k, v] : dic) {
        s += k + ":" + v.toString() + (i != dic.size() - 1 ? "," : "");
        ++i;
      }
      s += "}";
      return s;
    }
    return {};
  }
};

Value::Value(std::string_view str)
{
   body = new DynamicValue(std::string(str));
}

double Value::toNumber() {
  if (auto* num = std::get_if<double>(&body)) return *num;
  return 0.0;
}

std::string Value::toString() {
  if (std::holds_alternative<std::nullptr_t>(body)) {
    return "null";
  }
  if (std::holds_alternative<double>(body)) {
    return std::to_string(std::get<double>(body));
  }
  if (std::holds_alternative<NativeFunction>(body)) {
    return "NativeFunction";
  }
  if (auto** dv = asDynamicValue()) return (*dv)->toString();
  return "";
}

Value::operator std::string_view() {
  if (auto** dv = asDynamicValue()) return **dv;
  return ""sv;
}

size_t Value::length() {
  if (auto** dv = asDynamicValue()) return (*dv)->length();
  return 0;
}

Value& Value::operator[](size_t i) {
  if (!asDynamicValue()) {
    *this = new DynamicValue(Array(i + 1));
  }
  return (**asDynamicValue())[i];
}

Value& Value::operator[](std::string_view s) {
  if (!asDynamicValue()) {
    *this = new DynamicValue(Dic());
  }
  return (**asDynamicValue())[s];
}
