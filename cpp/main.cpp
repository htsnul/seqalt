#include <iostream>
#include "value.hpp"

extern Value evalCode(std::string_view);

std::string getStdinString() {
  std::string str;
  std::string line;
  while (std::getline(std::cin, line)) str += line + "\n";
  return str;
}

int main() {
  auto val = evalCode(getStdinString());
  std::cout << val.toString() << std::endl;
  return 0;
}