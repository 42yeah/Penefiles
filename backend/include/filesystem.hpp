#ifndef PENEFILES_FILESYSTEM_HPP
#define PENEFILES_FILESYSTEM_HPP

#ifdef USE_EXPERIMENTAL_FILESYSTEM
#include <experimental/filesystem>
namespace fs = std::experimental::filesystem;
#else
#include <filesystem>
namespace fs = std::filesystem;
#endif

#endif // PENEFILES_FILESYSTEM_HPP
