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

using Null = std::nullptr_t;
using Array = std::vector<Value>;
using Dic = std::unordered_map<std::string, Value>;
using NativeFunction = Value (*)(Value env, Value l, Value rExr);

struct Value {
  using Body = std::variant<Null, double, NativeFunction, DynamicValue*>;
  Body body;
  static Value fromBool(bool v) { return Value(v ? 1.0 : 0.0); }
  Value() {}
  Value(Body&& body) { this->body = body; }
  inline Value(std::string_view str);
  inline Value(std::initializer_list<Value> array);
  inline Value(std::initializer_list<std::pair<const std::string, Value>> dic);
  Value& operator=(Body&& body) { this->body = body; return *this; }
  inline bool operator==(Value v);
  bool isNull() { return std::holds_alternative<std::nullptr_t>(body); }
  double* asNumber() { return std::get_if<double>(&body); }
  NativeFunction* asNativeFunction() { return std::get_if<NativeFunction>(&body); }
  DynamicValue** asDynamicValue() { return std::get_if<DynamicValue*>(&body); }
  inline double toNumber();
  inline bool toBool();
  inline std::string toString();
  inline size_t length();
  inline size_t push(Value v);
  inline Value& operator[](size_t i);
  inline Value& operator[](std::string_view s);
};

struct DynamicValue {
  using Body = std::variant<std::string, Array, Dic>;
  Body body;
  DynamicValue() { garbageCollector.values.push_front(this); }
  DynamicValue(Body&& body) : DynamicValue() { this->body = body; }
  DynamicValue(std::initializer_list<Dic::value_type> list) : DynamicValue(Dic(list)) {}
  inline bool operator==(DynamicValue& v);
  std::string* asString() { return std::get_if<std::string>(&body); }
  Array* asArray() { return std::get_if<Array>(&body); }
  Dic* asDic() { return std::get_if<Dic>(&body); }
  inline std::string toString();
  inline operator std::string_view();
  inline size_t length();
  inline size_t push(Value v);
  inline Value& operator[](size_t i);
  inline Value& operator[](std::string_view str);
};

Value::Value(std::string_view str) {
  body = new DynamicValue(std::string(str));
}

Value::Value(std::initializer_list<Value> array) {
  body = new DynamicValue(array);
}

Value::Value(std::initializer_list<std::pair<const std::string, Value>> dic) {
  body = new DynamicValue(dic);
}

bool Value::operator==(Value v) {
  if (isNull() && v.isNull()) return true;
  if (auto n0 = asNumber()) {
    if (auto n1 = v.asNumber()) {
      if (*n0 == *n1) return true;
    }
  }
  if (auto d0 = asDynamicValue()) {
    if (auto d1 = v.asDynamicValue()) {
      if (**d0 == **d1) return true;
    }
  }
  return false;
}

double Value::toNumber() {
  if (auto num = asNumber()) return *num;
  return 0.0;
}

bool Value::toBool() {
  if (isNull()) return false;
  if (auto num = asNumber()) return *num != 0.0;
  return true;
}

std::string Value::toString() {
  if (isNull()) return "null";
  if (auto num = asNumber()) return std::to_string(*num);
  if (asNativeFunction()) return "NativeFunction";
  if (auto** dv = asDynamicValue()) return (*dv)->toString();
  return "";
}

size_t Value::length() {
  if (auto dv = asDynamicValue()) return (*dv)->length();
  return 0;
}

size_t Value::push(Value v) {
  if (!asDynamicValue()) body = new DynamicValue(Array());
  return (*asDynamicValue())->push(v);
}

Value& Value::operator[](size_t i) {
  if (!asDynamicValue()) body = new DynamicValue(Array(i + 1));
  return (**asDynamicValue())[i];
}

Value& Value::operator[](std::string_view s) {
  if (!asDynamicValue()) body = new DynamicValue(Dic());
  return (**asDynamicValue())[s];
}

bool DynamicValue::operator==(DynamicValue& v) {
  if (auto s0 = asString()) {
    if (auto s1 = v.asString()) {
      return *s0 == *s1;
    }
  }
  return false;
}

std::string DynamicValue::toString() {
  if (auto s = asString()) return *s;
  if (auto array = asArray()) {
    std::string s{"["};
    size_t i{0};
    for (auto& e : (*array)) {
      s += e.toString() + (++i != (*array).size() ? "," : "");
    }
    s += "]";
    return s;
  }
  if (auto dic = asDic()) {
    std::string s{"{"};
    size_t i{0};
    for (auto& [k, v] : (*dic)) {
      s += k + ":" + v.toString() + (++i != (*dic).size() ? "," : "");
    }
    s += "}";
    return s;
  }
  return {};
}

DynamicValue::operator std::string_view() {
  if (auto s = asString()) return *s;
  return ""sv;
}

size_t DynamicValue::length() {
  if (auto array = asArray()) return array->size();
  return 0;
}

size_t DynamicValue::push(Value v) {
  if (!asArray()) body = Array();
  asArray()->push_back(v);
  return length();
}

Value& DynamicValue::operator[](size_t i) {
  if (!asArray()) body = Array(i + 1);
  return asArray()->at(i);
}

Value& DynamicValue::operator[](std::string_view str) {
  if (!asDic()) body = Dic();
  return (*asDic())[std::string(str)];
}

