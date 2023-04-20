cmake_minimum_required(VERSION 3.10.0)

project(penefiles)

set(CMAKE_CXX_STANDARD 17)

# Set this option to ON to use std::experimental::filesystem instead of std::filesystem.
option(USE_EXPERIMENTAL_FILESYSTEM OFF) 

add_subdirectory(deps)
add_subdirectory(src)
add_subdirectory(sql)

