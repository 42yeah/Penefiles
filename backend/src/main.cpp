#include <iostream>
#include <oatpp/network/Server.hpp>
#include "AppComponent.hpp"
#include "controllers/PenefilesController.hpp"

void run()
{
    AppComponent components;

    OATPP_COMPONENT(std::shared_ptr<oatpp::web::server::HttpRouter>, router);
    router->addController(std::make_shared<PenefilesController>());

    OATPP_COMPONENT(std::shared_ptr<oatpp::network::ConnectionHandler>, connection_handler);
    OATPP_COMPONENT(std::shared_ptr<oatpp::network::ServerConnectionProvider>, connection_provider);

    oatpp::network::Server server(connection_provider, connection_handler);

    OATPP_LOGI("PENEfiles", "Server running on port %s", connection_provider->getProperty("port").getData());

    server.run();
}

int main() 
{
    std::cout << "PENEfiles will start running soon." << std::endl;
    oatpp::base::Environment::init();

    run();

    std::cout << std::endl << "Environment:" << std::endl;
    std::cout << "objectsCount = " << oatpp::base::Environment::getObjectsCount() << std::endl;
    std::cout << "objectsCreated = " << oatpp::base::Environment::getObjectsCreated() << std::endl << std::endl;
  
    oatpp::base::Environment::destroy();

    return 0;
}
