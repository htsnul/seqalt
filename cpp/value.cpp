#include "value.hpp"

#include <forward_list>
#include <unordered_map>
#include <vector>

using namespace std::literals;
using Array = std::vector<Value>;
using Dic = std::unordered_map<std::string, Value>;

struct DynamicValue {
  using Body = std::variant<std::string, Array, Dic>;
  Body body;
  DynamicValue(Body&& body) { this->body = body; }
  inline bool operator==(DynamicValue& v);
  std::string* asString() { return std::get_if<std::string>(&body); }
  Array* asArray() { return std::get_if<Array>(&body); }
  Dic* asDic() { return std::get_if<Dic>(&body); }
  std::string toString();
  size_t length();
  size_t push(Value v);
  Value& operator[](size_t i);
  bool has(std::string_view s);
  Value& operator[](std::string_view str);
};

struct GarbageCollector {
  std::forward_list<std::weak_ptr<DynamicValue>> values;
  template<class ...Args>
  std::shared_ptr<DynamicValue> makeShared(Args... args) {
    auto ptr = std::make_shared<DynamicValue>(args...);
    values.push_front(ptr);
    return ptr;
  }
} garbageCollector;

Value::Value(std::string_view str) {
  body = garbageCollector.makeShared(std::string(str));
}

Value::Value(std::initializer_list<Value> l) {
  body = garbageCollector.makeShared(l);
}

Value::Value(std::initializer_list<std::pair<const std::string, Value>> l) {
  body = garbageCollector.makeShared(l);
}

Value Value::shallowCopy() {
  if (auto d = asDynamicValue()) return Value(garbageCollector.makeShared(**d));
  return *this;
}

bool Value::operator==(Value v) {
  if (auto d0 = asDynamicValue(), d1 = v.asDynamicValue(); d0 && d1) {
    return **d0 == **d1;
  }
  return body == v.body;
}

bool Value::operator<(Value v) {
  return toNumber() < v.toNumber();
}

Value Value::operator+(Value v) {
  if (auto n0 = asNumber(), n1 = v.asNumber(); n0 && n1) {
    return {toNumber() + v.toNumber()};
  }
  return {toString() + v.toString()};
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
  if (auto dv = asDynamicValue()) return (*dv)->toString();
  return "";
}

size_t Value::length() {
  if (auto dv = asDynamicValue()) return (*dv)->length();
  return 0;
}

size_t Value::push(Value v) {
  if (!asDynamicValue()) body = garbageCollector.makeShared(Array());
  return (*asDynamicValue())->push(v);
}

Value& Value::operator[](size_t i) {
  if (!asDynamicValue()) body = garbageCollector.makeShared(Array(i + 1));
  return (**asDynamicValue())[i];
}

bool Value::has(std::string_view s) {
  if (auto dv = asDynamicValue()) return (*dv)->has(s);
  return false;
}

Value& Value::operator[](std::string_view s) {
  if (!asDynamicValue()) body = garbageCollector.makeShared(Dic());
  return (**asDynamicValue())[s];
}

bool DynamicValue::operator==(DynamicValue& v) {
  if (auto s0 = asString(), s1 = v.asString(); s0 && s1) {
    return *s0 == *s1;
  }
  return this == &v;
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

bool DynamicValue::has(std::string_view s) {
  if (auto dic = asDic()) return dic->find(std::string(s)) != dic->end();
  return 0;
}

Value& DynamicValue::operator[](std::string_view str) {
  if (!asDic()) body = Dic();
  return (*asDic())[std::string(str)];
}

