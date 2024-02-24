#!/bin/bash

get_sample() {
  local title=$1
  awk \
    '/^####/ { i = 0; }; i { print $0; }; /^#### '"$title"'/ { i = 1; }' \
    ../samples.txt
}

build() {
  clang++ -std=c++20 seqalt.cpp
}

run() {
  #get_sample "Hello World" | ./a.out
  get_sample "Arithmetic" | ./a.out
}

format() {
  ~/llvm/bin/clang-format -i seqalt.cpp
}

build_and_run (){
  build && run
}

$1
