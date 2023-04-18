#ifndef PENEFILES_PENEFILESCONTROLLER_HPP
#define PENEFILES_PENEFILESCONTROLLER_HPP

#include "dto/DTOs.hpp"

#include <oatpp/web/server/api/ApiController.hpp>
#include <oatpp/core/macro/codegen.hpp>
#include <oatpp/core/macro/component.hpp>
#include <oatpp/core/data/stream/FileStream.hpp>
#include <oatpp/web/protocol/http/outgoing/StreamingBody.hpp>
#include <oatpp/web/mime/multipart/FileProvider.hpp>
#include <oatpp/web/mime/multipart/InMemoryDataProvider.hpp>
#include <oatpp/web/mime/multipart/Reader.hpp>
#include <oatpp/web/mime/multipart/PartList.hpp>
#include <filesystem>
#include "services/PenefilesService.hpp"

#include OATPP_CODEGEN_BEGIN(ApiController)

class PenefilesController : public oatpp::web::server::api::ApiController 
{
public:
    /**
     * Constructor with object mapper.
     * @param objectMapper - default object mapper used to serialize/deserialize DTOs.
     */
    PenefilesController(OATPP_COMPONENT(std::shared_ptr<ObjectMapper>, object_mapper))
        : oatpp::web::server::api::ApiController(object_mapper)
    {
    }

private:
    PenefilesService penefiles_service;

public:

    ENDPOINT("GET", "/", root) 
    {
        auto dto = ResponseDto::createShared();
        dto->status = 200;
        dto->message = "Hello World!";
        return createDtoResponse(Status::CODE_200, dto);
    }

    ENDPOINT("GET", "/users", list_users)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.list_users());
    }

    ENDPOINT("POST", "/users/register", register_user,
        BODY_DTO(Object<UserRegistrationDto>, registration_dto))
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.create_user(registration_dto));
    }

    ENDPOINT("POST", "/users/login", login,
        BODY_DTO(Object<UserDto>, user_dto))
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.login(user_dto));
    }

    ENDPOINT("GET", "/codes/make", make_code)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.make_code());
    }

    //
    // File manipulation.
    //
    ENDPOINT("POST", "/auth/preflight", auth_preflight,
        BODY_DTO(Object<AuthenticationDto>, auth_dto))
    {
        oatpp::Object<ResponseDto> res = ResponseDto::createShared();

        if (penefiles_service.authenticate(auth_dto->session))
        {
            res->status = 200;
            res->message = "OK";
        }
        else
        {
            res->status = 500;
            res->message = "Authentication failed";
        }

        return createDtoResponse(Status::CODE_200, res);
    }

    ENDPOINT("GET", "/files", files)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.list_files());
    }

    ENDPOINT("GET", "/tags", tags)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.list_tags());
    }

    ENDPOINT("GET", "/files-tags", files_tags)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.list_files_tags());
    }

    // TODO: Private login check.
    ENDPOINT("GET", "/uploads/{realfile}/{filename}", download,
        PATH(String, realfile),
        PATH(String, filename))
    {
        auto file = penefiles_service.locate_file(realfile->c_str());
        OATPP_LOGI("PENEfiles", "Serving %s (real: %s).", file->filename->c_str(), file->realfile->c_str());

        auto body = std::make_shared<oatpp::web::protocol::http::outgoing::StreamingBody>(
            std::make_shared<oatpp::data::stream::FileInputStream>(file->realfile->c_str())
        );

        auto outgoing_response = OutgoingResponse::createShared(Status::CODE_200, body);
        outgoing_response->putHeader("Content-Length", std::to_string(file->size));

        return outgoing_response;
    }

    ENDPOINT("POST", "/files/upload", files_upload,
        REQUEST(std::shared_ptr<IncomingRequest>, request))
    {
        namespace fs = std::filesystem;
        namespace multipart = oatpp::web::mime::multipart;

        std::filesystem::path uploads("uploads");
        auto stat = fs::status(uploads);
        if (fs::status_known(stat) && stat.type() == fs::file_type::not_found)
        {
            OATPP_LOGI("PENEfiles", "Creating directory uploads/...");
            fs::create_directory(uploads);
        }
        stat = fs::status(uploads);
        if (stat.type() != fs::file_type::directory)
        {
            OATPP_LOGE("PENEfiles", "PENEfiles cannot create uploads. This is very bad, so uploads are off.");

            auto res = ResponseDto::createShared();
            res->status = 500;
            res->message = "Server side upload folder error";
            return createDtoResponse(Status::CODE_200, res);
        }

        auto mp = std::make_shared<multipart::PartList>(request->getHeaders());
        multipart::Reader mp_reader(mp.get());
        
        mp_reader.setPartReader("session", multipart::createInMemoryPartReader(32));
        std::string random_filename = uploads / penefiles_service.generate_random_string(32);
        mp_reader.setPartReader("file", multipart::createFilePartReader(random_filename));
        request->transferBody(&mp_reader);

        const auto session_part = mp->getNamedPart("session");
        const auto file_part = mp->getNamedPart("file");
        OATPP_ASSERT_HTTP(session_part, Status::CODE_500, "Session cannot be empty");
        std::string session_id(session_part->getPayload()->getInMemoryData()->c_str());

        auto user = penefiles_service.select_user_by_session(session_id);

        OATPP_ASSERT_HTTP(file_part && file_part->getFilename(), Status::CODE_500, "File cannot be empty");
        OATPP_ASSERT_HTTP(file_part->getFilename()->c_str(), Status::CODE_500, "Incomplete file");

        // Take a look at whether this file can be stat
        auto file_stat = fs::status(random_filename);
        OATPP_ASSERT_HTTP(fs::status_known(file_stat) && file_stat.type() != fs::file_type::not_found, Status::CODE_500, "File not uploaded");

        std::string file_name = file_part->getFilename()->c_str();

        std::vector<std::string> initial_tags;
        initial_tags.insert(initial_tags.end(), 
        {
            user->username->c_str(),
            PenefilesService::get_tag_by_filename(file_name)
        });

        auto file_dto = FileDto::createShared();
        file_dto->filename = file_name;
        file_dto->realfile = random_filename;
        file_dto->size = fs::file_size(random_filename);
        penefiles_service.create_file(file_dto, initial_tags);

        OATPP_LOGI("PENEfiles", "User %s has uploaded %s. Initial tags: %s, %s.", user->username->c_str(), file_name.c_str(), initial_tags[0].c_str(), initial_tags[1].c_str());
        
        auto res = ResponseDto::createShared();
        res->status = 200;
        res->message = "File created.";
        return createDtoResponse(Status::CODE_200, res);
    }
};

#include OATPP_CODEGEN_END(ApiController) //<-- End Codegen

#endif // PENEFILES_PENEFILESCONTROLLER_HPP
