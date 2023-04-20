cmake_minimum_required(VERSION 3.10.0)

project(penefiles)

set(CMAKE_CXX_STANDARD 17)

# Set this option to ON to use std::experimental::filesystem instead of std::filesystem.
option(USE_EXPERIMENTAL_FILESYSTEM OFF) 
# If Oat++ is compield using SQLite amalgamation, then specify this option.
option(DONT_LINK_SQLITE OFF)

add_subdirectory(deps)
add_subdirectory(src)
add_subdirectory(sql)

