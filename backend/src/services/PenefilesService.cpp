#include "services/PenefilesService.hpp"
#include <random>
#include <sstream>

oatpp::Object<ResponseDto> PenefilesService::create_user(const oatpp::Object<UserRegistrationDto> &dto)
{
    OATPP_ASSERT_HTTP(dto->password == dto->passwordAgain, Status::CODE_500, "Passwords does not match");
    OATPP_ASSERT_HTTP(dto->code->size() > 0, Status::CODE_500, "Must provide invitation code");
    auto code_result = database->select_code(dto->code);
    OATPP_ASSERT_HTTP(code_result->isSuccess(), Status::CODE_500, code_result->getErrorMessage());
    OATPP_ASSERT_HTTP(code_result->hasMoreToFetch(), Status::CODE_500, "Nonexistent code");
    code_result->fetch<oatpp::Vector<oatpp::Object<CodeDto> > >();

    auto result = database->create_user(dto->username, dto->password);
    auto response = ResponseDto::createShared();
    OATPP_ASSERT_HTTP(result->isSuccess(), Status::CODE_500, result->getErrorMessage());
    // if (!result->isSuccess())
    // {
    //     response->status = 500;
    //     response->message = result->getErrorMessage();
    //     return response;
    // }

    code_result = database->delete_code(dto->code);
    OATPP_ASSERT_HTTP(code_result->isSuccess(), Status::CODE_500, code_result->getErrorMessage());
    
    response->status = 200;
    response->message = "User created successfully.";
    return response;
}

std::string generate_random_string()
{
    std::uniform_int_distribution distrib(0, 61);
    std::random_device dev;
    std::stringstream ss;

    for (int i = 0; i < 16; i++)
    {
        int code = distrib(dev);
        if (code < 26)
        {
            ss << (char) ('A' + code);
        }
        else if (code < 52)
        {
            ss << (char) ('a' + (code - 26));
        }
        else
        {
            ss << (char) ('0' + (code - 52));
        }
    }
    return ss.str();
}

oatpp::Object<ResponseDto> PenefilesService::login(const oatpp::Object<UserDto> &dto)
{
    auto result = database->login_user(dto->username, dto->password);
    auto res = ResponseDto::createShared();

    OATPP_ASSERT_HTTP(result->isSuccess(), Status::CODE_500, result->getErrorMessage());
    OATPP_ASSERT_HTTP(result->hasMoreToFetch(), Status::CODE_500, "User not found");

    auto user = result->fetch<oatpp::Vector<oatpp::Object<UserDto> > >();
    OATPP_ASSERT_HTTP(user->size() == 1, Status::CODE_500, "Unknown error");

    std::string token = generate_random_string();
    user_sessions[token] = user[0];

    res->status = 200;
    res->message = token;
    return res;
}

oatpp::Object<CodeDto> PenefilesService::make_code()
{
    std::string code = generate_random_string();
    auto res = database->make_code(code);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    // Get latest code
    // auto code_id = oatpp::sqlite::Utils::getLastInsertRowId(res->getConnection());
    res = database->select_code(code);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    OATPP_ASSERT_HTTP(res->hasMoreToFetch(), Status::CODE_500, "No invitation code corresponding to ID");

    auto entry = res->fetch<oatpp::Vector<oatpp::Object<CodeDto> > >();
    OATPP_ASSERT_HTTP(entry->size() == 1, Status::CODE_500, "Unknown error");

    return entry[0];
}

oatpp::Object<UserDto> PenefilesService::select_user_by_session(const std::string &session_id)
{
    auto pos = user_sessions.find(session_id);
    // std::cout << "Looking for " << session_id << "..." << std::endl;
    // for (auto p : user_sessions) 
    // {
    //     std::cout << p.first << ": " << p.second->username->c_str() << std::endl;
    // }

    OATPP_ASSERT_HTTP(pos != user_sessions.end(), Status::CODE_500, "Invalid session ID.");

    auto id = pos->second->id;
    auto result = database->select_user(id);
    OATPP_ASSERT_HTTP(result->isSuccess(), Status::CODE_500, result->getErrorMessage());
    OATPP_ASSERT_HTTP(result->hasMoreToFetch(), Status::CODE_500, "Cannot find user.");

    auto entry = result->fetch<oatpp::Vector<oatpp::Object<UserDto> > >();
    OATPP_ASSERT_HTTP(entry->size() == 1, Status::CODE_500, "Unknown error");

    return entry[0];
}

bool PenefilesService::authenticate(const std::string &session_id)
{
    // Just a simple auth check.
    if (user_sessions.find(session_id) == user_sessions.end())
    {
        return false;
    }
    return true;
}
