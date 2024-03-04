#include "value.hpp"

#include <forward_list>
#include <sstream>
#include <unordered_map>
#include <vector>

using namespace std::literals;
using Array = std::vector<Value>;
using Dic = std::unordered_map<std::string, Value>;

struct DynamicValue {
  using Body = std::variant<std::string, Array, Dic>;
  Body body;
  bool isMarked{};
  DynamicValue(Body&& body) { this->body = body; }
  std::string* asString() { return std::get_if<std::string>(&body); }
  Array* asArray() { return std::get_if<Array>(&body); }
  Dic* asDic() { return std::get_if<Dic>(&body); }
  explicit operator std::string();
  size_t length();
  size_t push(Value v);
  Value& operator[](size_t i);
  Value* find(std::string_view s);
  Value& operator[](std::string_view str);
  std::string toJSONString();
  void mark();
  void sweep();
};

bool operator==(DynamicValue& v0, DynamicValue& v1);

struct GarbageCollector {
  std::forward_list<std::weak_ptr<DynamicValue>> values;
  template<class ...Args>
  std::shared_ptr<DynamicValue> makeShared(Args... args) {
    auto ptr = std::make_shared<DynamicValue>(args...);
    values.push_front(ptr);
    return ptr;
  }
  void sweep();
} garbageCollector;

void GarbageCollector::sweep() {
  for (auto itr = values.before_begin(); std::next(itr) != values.end();) {
    if (auto sp = std::next(itr)->lock()) sp->sweep();
    if (std::next(itr)->expired()) values.erase_after(itr); else itr++;
  }
  for (auto itr = values.before_begin(); std::next(itr) != values.end();) {
    if (std::next(itr)->expired()) values.erase_after(itr); else itr++;
  }
}

Value::Value(const std::string& str) : Value(garbageCollector.makeShared(str)) {}
Value::Value(ArrayInitializerList l) : Value(garbageCollector.makeShared(l)) {}
Value::Value(DicInitializerList l) : Value(garbageCollector.makeShared(l)) {}

Value Value::shallowCopy() {
  if (auto d = asDynamicValue()) return garbageCollector.makeShared(**d);
  return *this;
}

std::string* Value::asString() {
  if (auto dv = asDynamicValue()) return (*dv)->asString();
  return nullptr;
}

Value::operator double() {
  if (auto num = asNumber()) return *num;
  return 0.0;
}

Value::operator bool() {
  if (isNull()) return false;
  if (auto num = asNumber()) return *num != 0.0;
  return true;
}

Value::operator std::string() {
  if (isNull()) return "null";
  if (auto n = asNumber()) return (std::ostringstream{} << *n).str();
  if (asNativeFunc()) return "NativeFunc";
  if (auto dv = asDynamicValue()) return std::string(**dv);
  return "";
}

Value& Value::operator[](Value v) {
  if (auto n = v.asNumber()) {
    size_t ni = *n;
    if (!asDynamicValue()) body = garbageCollector.makeShared(Array(ni + 1));
    return (**asDynamicValue())[ni];
  }
  if (!asDynamicValue()) body = garbageCollector.makeShared(Dic());
  return (**asDynamicValue())[std::string(v)];
}

size_t Value::length() {
  if (auto dv = asDynamicValue()) return (*dv)->length();
  return 0;
}

size_t Value::push(Value v) {
  if (!asDynamicValue()) body = garbageCollector.makeShared(Array());
  return (*asDynamicValue())->push(v);
}

Value* Value::find(std::string_view s) {
  if (auto v = asDynamicValue()) return (*v)->find(s);
  return nullptr;
}

std::string Value::toJSONString() {
  if (isNull()) return "null";
  if (auto n = asNumber()) return (std::ostringstream{} << *n).str();
  if (asNativeFunc()) return "NativeFunc";
  if (auto dv = asDynamicValue()) return (*dv)->toJSONString();
  return "";
}

void Value::mark() { if (auto v = asDynamicValue()) (*v)->mark(); }
void Value::sweep() { garbageCollector.sweep(); }

bool operator==(Value v0, Value v1) {
  if (auto d0 = v0.asDynamicValue(), d1 = v1.asDynamicValue(); d0 && d1) {
    return **d0 == **d1;
  }
  return v0.body == v1.body;
}

Value operator+(Value v0, Value v1) {
  if (auto n0 = v0.asNumber(), n1 = v1.asNumber(); n0 && n1) {
    return *n0 + *n1;
  }
  return std::string(v0) + std::string(v1);
}

DynamicValue::operator std::string() {
  if (auto s = asString()) return *s;
  if (auto array = asArray()) {
    std::string s{"["};
    size_t i{0};
    for (auto& e : (*array)) {
      s += std::string(e) + (++i != (*array).size() ? "," : "");
    }
    s += "]";
    return s;
  }
  if (auto dic = asDic()) {
    std::string s{"{"};
    size_t i{0};
    for (auto& [k, v] : (*dic)) {
      s += k + ":" + std::string(v) + (++i != (*dic).size() ? "," : "");
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

Value* DynamicValue::find(std::string_view s) {
  if (auto dic = asDic()) {
    if (auto itr = dic->find(std::string(s)); itr != dic->end()) {
      return &itr->second;
    }
  }
  return nullptr;
}

Value& DynamicValue::operator[](std::string_view str) {
  if (!asDic()) body = Dic();
  return (*asDic())[std::string(str)];
}

std::string DynamicValue::toJSONString() {
  if (auto s = asString()) return *s;
  if (auto array = asArray()) {
    std::string s{"["};
    size_t i{0};
    for (auto& e : (*array)) {
      s += std::string(e) + (++i != (*array).size() ? "," : "");
    }
    s += "]";
    return s;
  }
  if (auto dic = asDic()) {
    std::string s{"{"};
    size_t i{0};
    for (auto& [k, v] : (*dic)) {
      s += k + ":" + std::string(v) + (++i != (*dic).size() ? "," : "");
    }
    s += "}";
    return s;
  }
  return {};
}

void DynamicValue::mark() {
  if (isMarked) return;
  isMarked = true;
  if (auto array = asArray()) {
    for (auto& e : (*array)) e.mark();
  }
  if (auto dic = asDic()) {
    for (auto& [k, v] : (*dic)) v.mark();
  }
}

void DynamicValue::sweep() {
  if (!isMarked) body = Array{};
  isMarked = false;
}

bool operator==(DynamicValue& v0, DynamicValue& v1) {
  if (auto s0 = v0.asString(), s1 = v1.asString(); s0 && s1) {
    return *s0 == *s1;
  }
  return &v0 == &v1;
}

