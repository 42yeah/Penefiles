#ifndef PENEFILES_APPCOMPONENT_HPP
#define PENEFILES_APPCOMPONENT_HPP

#include <iostream>
#include <oatpp/web/server/HttpConnectionHandler.hpp>
#include <oatpp/network/tcp/server/ConnectionProvider.hpp>
#include <oatpp/web/server/interceptor/AllowCorsGlobal.hpp>
#include <oatpp/parser/json/mapping/ObjectMapper.hpp>
#include <oatpp/core/macro/component.hpp>
#include <oatpp-sqlite/orm.hpp>
#include "db/PenefilesDb.hpp"

class AppComponent
{
public:
    OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::network::ServerConnectionProvider>, server_connection_provider)([] {
        return oatpp::network::tcp::server::ConnectionProvider::createShared({ "0.0.0.0", 4243, oatpp::network::Address::IP_4 });
    }());

    OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::web::server::HttpRouter>, http_router)([] {
        return oatpp::web::server::HttpRouter::createShared();
    }());

    OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::network::ConnectionHandler>, server_connection_handler)([] {
        OATPP_COMPONENT(std::shared_ptr<oatpp::web::server::HttpRouter>, router);

        auto connection_handler = oatpp::web::server::HttpConnectionHandler::createShared(router);
        connection_handler->addRequestInterceptor(std::make_shared<oatpp::web::server::interceptor::AllowOptionsGlobal>());
        connection_handler->addResponseInterceptor(std::make_shared<oatpp::web::server::interceptor::AllowCorsGlobal>());
        
        return connection_handler;
    }());

    OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::data::mapping::ObjectMapper>, api_object_mapper)([] {
        return oatpp::parser::json::mapping::ObjectMapper::createShared();
    }());

    OATPP_CREATE_COMPONENT(std::shared_ptr<PenefilesDb>, database_client)([] {
        /* Create database-specific ConnectionProvider */
        auto connectionProvider = std::make_shared<oatpp::sqlite::ConnectionProvider>("sql/penefiles.sqlite3");

        /* Create database-specific ConnectionPool */
        auto connectionPool = oatpp::sqlite::ConnectionPool::createShared(connectionProvider, 
                                                                          10 /* max-connections */, 
                                                                          std::chrono::seconds(5) /* connection TTL */);

        /* Create database-specific Executor */
        auto executor = std::make_shared<oatpp::sqlite::Executor>(connectionPool);

        /* Create PenefilesDb database client */
        return std::make_shared<PenefilesDb>(executor);
    }());

private:

};

#endif // PENEFILES_APPCOMPONENT_HPP
